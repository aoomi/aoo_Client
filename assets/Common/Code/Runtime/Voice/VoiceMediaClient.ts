import { ProtocolHttpClient } from '../network/ProtocolHttpClient';
export interface RecordedVoice { readonly bytes: Uint8Array; readonly durationMillis: number; readonly mimeType: 'audio/aac'|'audio/ogg'|'audio/amr'; }
export interface VoiceRecorder { record(): Promise<RecordedVoice|null>; play(data: Uint8Array,mimeType:string):Promise<void>; stop?():void; cancel():void; }
export interface ReadyVoice { readonly assetId:number; readonly durationMillis:number; readonly mimeType:string; readonly state:'READY'; }
export interface VoiceClientContext { readonly deviceId:string;readonly channel:string;readonly clientVersion:string; }

/** Browser voice adapter. Native shells may continue injecting their platform recorder. */
export class BrowserVoiceRecorder implements VoiceRecorder {
  private stream:MediaStream|null=null;private recorder:MediaRecorder|null=null;private timeout=0;private cancelled=false;private stopRequested=false;
  public async record():Promise<RecordedVoice|null>{
    if(typeof navigator==='undefined'||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('当前浏览器不支持录音');
    this.cancel();this.cancelled=false;this.stopRequested=false;const started=Date.now();this.stream=await navigator.mediaDevices.getUserMedia({audio:true});
    const preferred=['audio/ogg;codecs=opus','audio/webm;codecs=opus','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type));
    const chunks:BlobPart[]=[];const recorder=new MediaRecorder(this.stream,preferred?{mimeType:preferred}:undefined);this.recorder=recorder;
    return new Promise<RecordedVoice|null>((resolve,reject)=>{
      recorder.ondataavailable=event=>{if(event.data.size>0)chunks.push(event.data);};
      recorder.onerror=()=>{this.release();reject(new Error('浏览器录音失败'));};
      recorder.onstop=()=>{const cancelled=this.cancelled,durationMillis=Math.max(1,Date.now()-started),blob=new Blob(chunks,{type:recorder.mimeType});this.release();if(cancelled){resolve(null);return;}blob.arrayBuffer().then(buffer=>resolve({bytes:new Uint8Array(buffer),durationMillis,mimeType:'audio/ogg'}),reject);};
      recorder.start(200);if(this.stopRequested)recorder.stop();else this.timeout=globalThis.setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},10_000);
    });
  }
  public async play(data:Uint8Array,mimeType:string):Promise<void>{
    const url=URL.createObjectURL(new Blob([new Uint8Array(data)],{type:mimeType}));const audio=new Audio(url);
    try{await audio.play();await new Promise<void>((resolve,reject)=>{audio.onended=()=>resolve();audio.onerror=()=>reject(new Error('语音播放失败'));});}finally{URL.revokeObjectURL(url);}
  }
  public cancel():void{this.cancelled=true;this.stopRequested=true;if(this.recorder&&this.recorder.state!=='inactive')this.recorder.stop();else this.release();}
  public stop():void{this.stopRequested=true;if(this.recorder&&this.recorder.state!=='inactive')this.recorder.stop();}
  private release():void{if(this.timeout)globalThis.clearTimeout(this.timeout);this.timeout=0;for(const track of this.stream?.getTracks()??[])track.stop();this.stream=null;this.recorder=null;}
}

/** The sole voice binary path. It never exposes or accepts an object-storage URL. */
export class VoiceMediaClient {
  private readonly controllers=new Set<AbortController>();
  public constructor(private readonly baseUrl:string,private readonly bearer:()=>Promise<string>,private readonly context:()=>VoiceClientContext,private readonly recorder:VoiceRecorder){}
  public record():Promise<RecordedVoice|null>{return this.recorder.record();}
  public stop():void{this.recorder.stop?.();}
  public async upload(voice:RecordedVoice):Promise<ReadyVoice>{
    if(!Number.isInteger(voice.durationMillis)||voice.durationMillis<1||voice.durationMillis>60_000||voice.bytes.byteLength<1)throw new Error('VOICE_RECORDING_INVALID');
    const sha256=await this.hash(voice.bytes);const initiated=await this.call<{ticketId:string|null;assetId:number|null;chunkBytes:number;expectedParts:number;deduplicated:boolean}>('/api/v2/media/uploads','POST',JSON.stringify({kind:'VOICE',mimeType:voice.mimeType,byteSize:voice.bytes.byteLength,durationMillis:voice.durationMillis,sha256}),{'Content-Type':'application/json'});
    if(initiated.deduplicated)return {assetId:this.assetId(initiated.assetId),durationMillis:voice.durationMillis,mimeType:voice.mimeType,state:'READY'};
    if(!initiated.ticketId||initiated.chunkBytes<1||initiated.expectedParts<1)throw new Error('VOICE_UPLOAD_TICKET_INVALID');
    for(let part=1;part<=initiated.expectedParts;part++){const from=(part-1)*initiated.chunkBytes,to=Math.min(voice.bytes.length,from+initiated.chunkBytes);await this.call(`/api/v2/media/uploads/${encodeURIComponent(initiated.ticketId)}/parts/${part}`,'PUT',voice.bytes.slice(from,to));}
    const completed=await this.call<{assetId:number}>(`/api/v2/media/uploads/${encodeURIComponent(initiated.ticketId)}/complete`,'POST',new Uint8Array());
    return {assetId:this.assetId(completed.assetId),durationMillis:voice.durationMillis,mimeType:voice.mimeType,state:'READY'};
  }
  public async play(asset:ReadyVoice):Promise<void>{if(asset.state!=='READY')throw new Error('VOICE_NOT_READY');const bytes=await this.callBytes(`/api/v2/media/assets/${this.assetId(asset.assetId)}/content`);await this.recorder.play(bytes,asset.mimeType);}
  public describe(assetId:number):Promise<ReadyVoice>{return this.call<ReadyVoice>(`/api/v2/media/assets/${this.assetId(assetId)}`,'GET',undefined);}
  public cancel():void{for(const c of this.controllers)c.abort();this.controllers.clear();this.recorder.cancel();}
  private async call<T>(path:string,method:string,body?:BodyInit,extra:Record<string,string>={}):Promise<T>{const response=await this.request(path,method,body,extra);const payload=await response.json() as {code?:string;message?:string;data?:T};if(!response.ok||!payload.data)throw new Error(payload.code??'VOICE_MEDIA_FAILED');return payload.data;}
  private async callBytes(path:string):Promise<Uint8Array>{const response=await this.request(path,'GET',undefined);if(!response.ok)throw new Error('VOICE_PLAYBACK_UNAUTHORIZED');return new Uint8Array(await response.arrayBuffer());}
  private async request(path:string,method:string,body?:BodyInit,extra:Record<string,string>={}):Promise<Response>{const c=new AbortController();this.controllers.add(c);const x=this.context();if(!x.deviceId||!x.channel||!x.clientVersion)throw new Error('VOICE_CLIENT_CONTEXT_REQUIRED');try{return await ProtocolHttpClient.fetch(new URL(path,this.baseUrl),{method,body,signal:c.signal,headers:{Authorization:`Bearer ${await this.bearer()}`,'X-Aoo-Api-Version':'1','X-Device-Id':x.deviceId,'X-Client-Channel':x.channel,'X-Client-Version':x.clientVersion,...extra}});}finally{this.controllers.delete(c);}}
  private assetId(value:unknown):number{const n=Number(value);if(!Number.isSafeInteger(n)||n<=0)throw new Error('VOICE_ASSET_ID_INVALID');return n;}
  private async hash(bytes:Uint8Array):Promise<string>{const copy=new Uint8Array(bytes);const digest=await crypto.subtle.digest('SHA-256',copy.buffer);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
}
