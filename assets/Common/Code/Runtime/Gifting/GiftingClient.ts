import { ProtocolHttpClient } from '../network/ProtocolHttpClient';
export type GiftState = 'RESERVED'|'PROCESSING'|'DEBITED'|'COMPLETED'|'COMPENSATED'|'COMPENSATION_PENDING';
export interface GiftReceipt { id:string; sender:number; recipient:number; asset:string; quantity:number; state:GiftState; failureCode?:string }
export interface GiftLedgerEntry { sequence:number; giftId:string; counterpartyId:number; direction:'IN'|'OUT'; asset:string; quantity:number; createdAt:string }
export class GiftingError extends Error { constructor(readonly code:string,message:string,readonly status:number){super(message)} }
/** Sole client entry point for the authenticated production gifting API. */
export class GiftingClient {
  private readonly controllers=new Set<AbortController>(); private disposed=false;
  constructor(private readonly baseUrl:string,private readonly bearer:()=>Promise<string>,private readonly deviceId:()=>string) {if(!baseUrl)throw new Error('gifting service URL required');}
  async send(recipientId:number,asset:string,quantity:number,idempotencyKey:string):Promise<GiftReceipt>{
    return this.call('/api/v2/gifts',{method:'POST',headers:{'Idempotency-Key':idempotencyKey},body:JSON.stringify({recipientId,asset,quantity})});
  }
  async status(giftId:string):Promise<GiftReceipt>{return this.call(`/api/v2/gifts/${encodeURIComponent(giftId)}`,{method:'GET'});}
  async ledger():Promise<GiftLedgerEntry[]>{return this.call('/api/v2/gifts/ledger',{method:'GET'});}
  async inbox(after:number):Promise<GiftLedgerEntry[]>{return this.call(`/api/v2/gifts/inbox?after=${Math.max(0,after)}`,{method:'GET'});}
  cancelPending():void{for(const c of this.controllers)c.abort();this.controllers.clear();}
  destroy():void{this.disposed=true;this.cancelPending();}
  private async call<T>(path:string,init:RequestInit):Promise<T>{if(this.disposed)throw new GiftingError('CLIENT_DISPOSED','页面已关闭',0);const url=new URL(path,this.baseUrl);const local=['127.0.0.1','localhost','::1'].includes(url.hostname);if(url.protocol!=='https:'&&!(local&&url.protocol==='http:'))throw new GiftingError('INSECURE_ENDPOINT','生产赠送服务必须使用 HTTPS',0);const controller=new AbortController();this.controllers.add(controller);try{const response=await ProtocolHttpClient.fetch(url,{...init,signal:controller.signal,headers:{...init.headers,'Authorization':`Bearer ${await this.bearer()}`,'X-Aoo-Api-Version':'1','X-Device-Id':this.deviceId(),'X-Client-Channel':'creator-web','X-Client-Version':'1.0.0','Content-Type':'application/json'}});const payload=await response.json();if(!response.ok)throw new GiftingError(payload.code??'GIFT_REQUEST_FAILED',payload.message??'Gift request failed',response.status);return payload.data as T;}finally{this.controllers.delete(controller);}}
}
