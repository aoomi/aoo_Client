/**
 * The category's only protocol adapter. Regional tables supply a profile; they do
 * not duplicate networking or UI. PXPHZ intentionally uses the authoritative
 * migrated boundary and never sends the legacy CPXPHZ messages directly.
 */
export interface WordCardTransport { request<T>(message:string,payload:unknown):Promise<T>; on(message:string,handler:(value:unknown)=>void):()=>void }
export interface WordCardProfile { readonly code:string;readonly dispatch:string;readonly response:string;readonly version:string }
export const PXPHZ_PROFILE:WordCardProfile={code:'pxphz',dispatch:'wordcard.pxphz.dispatch',response:'wordcard.pxphz.response',version:'1.0.0'};
export const XPPHZ_PROFILE:WordCardProfile={code:'xpphz',dispatch:'wordcard.xpphz.dispatch',response:'wordcard.xpphz.response',version:'1.0.0'};
export const GLZP_PROFILE:WordCardProfile={code:'glzp',dispatch:'wordcard.glzp.dispatch',response:'wordcard.glzp.response',version:'1.0.0'};
export const YCHP_PROFILE:WordCardProfile={code:'ychp',dispatch:'wordcard.ychp.dispatch',response:'wordcard.ychp.response',version:'1.0.0'};
export const AHPHZ_PROFILE:WordCardProfile={code:'ahphz',dispatch:'wordcard.ahphz.dispatch',response:'wordcard.ahphz.response',version:'1.0.0'};
export const LCZP_PROFILE:WordCardProfile={code:'lczp',dispatch:'wordcard.lczp.dispatch',response:'wordcard.lczp.response',version:'1.0.0'};
export interface WordCardRoomView {roomId:number;gameCode:string;stateVersion:number;phase:string;currentSeat:number;winnerSeat:number;seats:Record<string,{playerId:number;ready:boolean;cards:number[];cardCount:number;huXi:number;piao?:number;guChou?:boolean}>}
export class WordCardNetworkAdapter {
 private sequence=0;private current?:WordCardRoomView;private cancel?:()=>void;
 constructor(private readonly wire:WordCardTransport,private readonly roomId:number,private readonly profile:WordCardProfile){if(roomId<=0)throw new Error('invalid word-card room');}
 connect(push:(view:WordCardRoomView)=>void):void{if(this.cancel)return;this.cancel=this.wire.on(this.profile.response,p=>push(this.accept(p)));}
 disconnect():void{this.cancel?.();this.cancel=undefined;}
 snapshot():WordCardRoomView|undefined{return this.current;}
 state(seatId=0){return this.send(seatId,'state',{});}join(seatId:number){return this.send(seatId,'join',{});}ready(seatId:number){return this.send(seatId,'ready',{});}start(){return this.send(0,'start',{});}piao(seatId:number,value:number){return this.send(seatId,'piao',{}, {piao:value});}guChou(seatId:number){return this.send(seatId,'guChou',{});}operate(seatId:number,operation:string,cards:number[]=[],huXi?:number){return this.send(seatId,'operation',{operation,cards,...(huXi===undefined?{}:{huXi})});}
 private async send(seatId:number,action:string,payload:Record<string,unknown>,extra:Record<string,unknown>={}):Promise<WordCardRoomView>{return this.accept(await this.wire.request(this.profile.dispatch,{roomId:this.roomId,playVersion:this.profile.version,sequence:++this.sequence,seatId,action,payload,...extra}));}
 private accept(raw:unknown):WordCardRoomView{if(!raw||typeof raw!=='object')throw new Error('invalid word-card response');const view=raw as WordCardRoomView;if(view.roomId!==this.roomId||view.gameCode!==this.profile.code)throw new Error('cross-game word-card response');if(this.current&&view.stateVersion<this.current.stateVersion)return this.current;return this.current=view;}
}
