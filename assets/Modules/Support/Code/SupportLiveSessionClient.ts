import { ProtocolHttpClient } from '../../../Common/Code/Runtime/network/ProtocolHttpClient';
export type SupportSessionStatus = 'QUEUED' | 'ACTIVE' | 'DISCONNECTED' | 'CLOSED';
export interface SupportMessage { id: number; sender: 'PLAYER'|'SUPPORT'|'SYSTEM'; senderId: number; body: string; mediaReference?: string; createdAt: string; }
export interface SupportLiveSession { id:number; caseId:number; playerId:number; agentId?:number; status:SupportSessionStatus; lastMessageId:number; version:number; messages:SupportMessage[]; }
interface Envelope<T> { code:string; data:T }

/** Support module production client. The caller supplies the Account bearer. */
export class SupportLiveSessionClient {
  private readonly controllers=new Set<AbortController>(); private disposed=false;
  constructor(private readonly origin:string, private readonly bearer:()=>Promise<string>) {if(!origin)throw new Error('support service endpoint required');}
  enqueue(caseId:number, idempotencyKey=crypto.randomUUID()):Promise<SupportLiveSession>{return this.request('',{method:'POST',body:JSON.stringify({caseId})},idempotencyKey);}
  get(id:number,afterMessageId=0):Promise<SupportLiveSession>{return this.request(`/${id}?afterMessageId=${afterMessageId}`,{method:'GET'});}
  send(id:number,body:string,mediaReference?:string,idempotencyKey=crypto.randomUUID()):Promise<SupportLiveSession>{return this.request(`/${id}/messages`,{method:'POST',body:JSON.stringify({body,mediaReference})},idempotencyKey);}
  disconnect(id:number,version:number,idempotencyKey=crypto.randomUUID()):Promise<SupportLiveSession>{return this.request(`/${id}/disconnect`,{method:'POST',body:JSON.stringify({version})},idempotencyKey);}
  reconnect(id:number,afterMessageId:number,idempotencyKey=crypto.randomUUID()):Promise<SupportLiveSession>{return this.request(`/${id}/reconnect`,{method:'POST',body:JSON.stringify({afterMessageId})},idempotencyKey);}
  dispose():void{this.disposed=true;for(const c of this.controllers)c.abort();this.controllers.clear();}
  private async request(path:string,init:RequestInit,key?:string):Promise<SupportLiveSession>{if(this.disposed)throw new SupportApiError(0,'CLIENT_DISPOSED','客服页面已关闭');const token=await this.bearer();const headers:Record<string,string>={'Authorization':`Bearer ${token}`,'X-Aoo-Api-Version':'1','Content-Type':'application/json'};if(key)headers['Idempotency-Key']=key;const controller=new AbortController();this.controllers.add(controller);try{const response=await ProtocolHttpClient.fetch(`${this.origin.replace(/\/$/,'')}/api/v2/support/live-sessions${path}`,{...init,headers,signal:controller.signal});const payload=await response.json() as Envelope<SupportLiveSession>&{message?:string};if(!response.ok)throw new SupportApiError(response.status,payload.code,payload.message??'Support request failed');return payload.data;}finally{this.controllers.delete(controller);}}
}
export class SupportApiError extends Error { constructor(readonly status:number,readonly code:string,message:string){super(message);this.name='SupportApiError';} }
