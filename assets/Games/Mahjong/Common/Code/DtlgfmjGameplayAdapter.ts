import{MahjongWaitingExSequentialAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface DtlgfmjTransport{request<T>(message:string,payload:unknown):Promise<T>;on(message:string,handler:(payload:unknown)=>void):()=>void;}
/** Exact legacy DTLGFMJCfg ordinals: 0点炮包胡, 1可胡七小对, 2杠牌算分. */
export type DtlgfmjOption=0|1|2;
export interface DtlgfmjRuleSelections{playerMinNum:2|3|4;playerNum:2|3|4;setCount:number;paymentRoomCardType:0|1|2;kexuanwanfa:readonly DtlgfmjOption[];fangjian:readonly number[];xianShi:0|1|2|3|4;jiesan:0|1|2|3|4;gaoji:readonly number[];shuffleSeed?:number;}
export type DtlgfmjPhase='LOBBY'|'WAITING_EX'|'PLAYING'|'SETTLED';
export interface DtlgfmjSnapshot{readonly roomId:number;readonly gameCode:'dtlgfmj';readonly stateVersion:number;readonly phase:DtlgfmjPhase;readonly choiceSeat:number;readonly piaoFen:readonly number[];readonly gangPoints:readonly number[];readonly createRules:Readonly<DtlgfmjRuleSelections>;readonly[field:string]:unknown;}
/** Intent-only adapter: Hu/pattern detection, gang points and settlement remain server authoritative. */
export const DTLGFMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('dtlgfmj')!;export const DTLGFMJ_ROUTE='mahjong.dtlgfmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class DtlgfmjGameplayAdapter extends MahjongWaitingExSequentialAdapter{constructor(wire:DtlgfmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,DTLGFMJ_REGION_BINDING);}}

