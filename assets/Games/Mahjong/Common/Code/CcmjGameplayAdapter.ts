import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface CcmjTransport{request<T>(message:string,payload:unknown):Promise<T>;on(message:string,handler:(payload:unknown)=>void):()=>void;}
/** 0点炮包其他家,1三风蛋,2带缺门,3下蛋算站立,4通宝翻番,5当圈听,6豪华七对,7两头夹,8有胡必胡,9蛋随庄走,10不许吃牌,11飘胡七对放宽,12明宝. */
export type CcmjOption=0|1|2|3|4|5|6|7|8|9|10|11|12;
export interface CcmjRuleSelections{playerMinNum:2|3|4;playerNum:2|3|4;setCount:number;paymentRoomCardType:0|1|2;kexuanwanfa:readonly CcmjOption[];fangjian:readonly number[];xianShi:0|1|2|3|4;jiesan:0|1|2|3|4;gaoji:readonly number[];shuffleSeed?:number;}
export type CcmjPhase='LOBBY'|'PLAYING'|'SETTLED';
export interface CcmjSnapshot{readonly roomId:number;readonly gameCode:'ccmj';readonly stateVersion:number;readonly phase:CcmjPhase;readonly treasureIndicator:number;readonly treasure:number;readonly treasureOpened:boolean;readonly eggs:readonly number[];readonly ting:readonly boolean[];readonly wallReserve:14|15|16|17;readonly createRules:Readonly<CcmjRuleSelections>;readonly[field:string]:unknown;}
/** Intent-only adapter: kai-jin, treasure visibility, egg/reserve legality, Hu and settlement remain server authoritative. */
export const CCMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('ccmj')!;export const CCMJ_ROUTE='mahjong.ccmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class CcmjGameplayAdapter extends MahjongStandardDirectAdapter<CcmjSnapshot>{constructor(wire:CcmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,CCMJ_REGION_BINDING);}}

