import{MahjongWaitingExSequentialAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface DnmjTransport{request<T>(message:string,payload:unknown):Promise<T>;on(message:string,handler:(payload:unknown)=>void):()=>void;}
/** 0杠上开花; maShu ordinals map to 0,2,4,6,8,10 horses; wanFa 0流局不算分,1流局庄赔闲. */export type DnmjOption=0;
export interface DnmjRuleSelections{playerMinNum:2|3|4;playerNum:2|3|4;setCount:number;paymentRoomCardType:0|1|2;maShu:0|1|2|3|4|5;wanFa:0|1;kexuanwanfa:readonly DnmjOption[];fangjian:readonly number[];xianShi:0|1|2|3|4;jiesan:0|1|2|3|4;gaoji:readonly number[];shuffleSeed?:number;}
export type DnmjPhase='LOBBY'|'WAITING_EX'|'PLAYING'|'SETTLED';export interface DnmjSnapshot{readonly roomId:number;readonly gameCode:'dnmj';readonly stateVersion:number;readonly phase:DnmjPhase;readonly choiceSeat:number;readonly piaoFen:readonly number[];readonly horseCards:readonly number[];readonly horseHits:Readonly<Record<number,number>>;readonly createRules:Readonly<DnmjRuleSelections>;readonly[field:string]:unknown;}
/** Intent-only: piao normalization, tile inventory, Hu legality, multipliers and settlement are server authoritative. */
export const DNMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('dnmj')!;export const DNMJ_ROUTE='mahjong.dnmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class DnmjGameplayAdapter extends MahjongWaitingExSequentialAdapter{constructor(wire:DnmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,DNMJ_REGION_BINDING);}}

