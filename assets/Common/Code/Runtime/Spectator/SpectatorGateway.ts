import { ProtocolHttpClient } from '../network/ProtocolHttpClient';
import { gatewayOrigin } from '../network/GatewayEntryPolicy';
export interface SpectatorAdmission { requestId:number; roomId:number; spectatorId:number; status:'PENDING'|'AUTHORIZED'|'REJECTED'|'LEFT'; }
export interface SpectatorEvent { sequence:number; type:string; payload:unknown; occurredAt:string; }
export interface SpectatorStream { roomId:number; nextSequence:number; delayMillis:number; events:SpectatorEvent[]; }
export interface SpectatorSnapshot { perspective:'SPECTATOR_PUBLIC'; summary:Record<string,unknown>; publicTimeline:SpectatorStream; }

export class SpectatorGateway {
  private readonly controllers=new Set<AbortController>();
  private readonly origin:string;
  public constructor(origin:string,private readonly bearer:string){if(!bearer)throw new Error('spectator bearer required');this.origin=gatewayOrigin(origin).toString();}
  public request(roomId:number){return this.call<SpectatorAdmission>('POST',`/api/v2/spectator/rooms/${this.id(roomId)}/requests`,{});}
  public status(requestId:number){return this.call<SpectatorAdmission>('GET',`/api/v2/spectator/requests/${this.id(requestId)}`);}
  public pending(roomId:number){return this.call<SpectatorAdmission[]>('GET',`/api/v2/spectator/rooms/${this.id(roomId)}/requests`);}
  public authorize(requestId:number,approved:boolean){return this.call<SpectatorAdmission>('POST',`/api/v2/spectator/requests/${this.id(requestId)}/authorization`,{approved});}
  public leave(roomId:number){return this.call<SpectatorAdmission>('POST',`/api/v2/spectator/rooms/${this.id(roomId)}/leave`,{});}
  public snapshot(roomId:number){return this.call<SpectatorSnapshot>('GET',`/api/v2/spectator/rooms/${this.id(roomId)}/snapshot?limit=500`);}
  public events(roomId:number,after:number){return this.call<SpectatorStream>('GET',`/api/v2/spectator/rooms/${this.id(roomId)}/events?afterSequence=${this.cursor(after)}&limit=100`);}
  public destroy(){for(const c of this.controllers)c.abort();this.controllers.clear();}
  private id(v:number){if(!Number.isSafeInteger(v)||v<=0)throw new Error('positive integer id required');return v;}
  private cursor(v:number){if(!Number.isSafeInteger(v)||v<0)throw new Error('valid cursor required');return v;}
  private async call<T>(method:'GET'|'POST',path:string,body?:unknown):Promise<T>{const controller=new AbortController();this.controllers.add(controller);try{const response=await ProtocolHttpClient.fetch(new URL(path.replace(/^\//,''),this.origin.replace(/\/?$/,'/')),{method,headers:{Authorization:`Bearer ${this.bearer}`,'X-Aoo-Api-Version':'1','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});const packet=await response.json() as {code?:string;data?:T;error?:{code?:string}};if(!response.ok||packet.code!=='OK')throw new Error(packet.error?.code??packet.code??`HTTP_${response.status}`);return packet.data as T;}finally{this.controllers.delete(controller);}}
}
