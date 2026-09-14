import{MahjongWaitingExSequentialAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface CxmjTransport{request<T>(message:string,payload:unknown):Promise<T>;on(message:string,handler:(payload:unknown)=>void):()=>void;}
/** 0可放炮,1海底/摇色算自摸,2最多双大胡,3缺一门,4缺一色,5板板胡,6俱乐部积分不低于0,7带多少只赢多少. */export type CxmjOption=0|1|2|3|4|5|6|7;
export interface CxmjRuleSelections{playerMinNum:2|3|4;playerNum:2|3|4;setCount:number;paymentRoomCardType:0|1|2;kexuanwanfa:readonly CxmjOption[];fangjian:readonly number[];xianShi:0|1|2|3|4;jiesan:0|1|2|3|4;gaoji:readonly number[];xiaojuqiepai:number;dajusuanfen:number;shuffleSeed?:number;}
export type CxmjPhase='LOBBY'|'WAITING_EX'|'PLAYING'|'SETTLED';export interface CxmjSnapshot{readonly roomId:number;readonly gameCode:'cxmj';readonly stateVersion:number;readonly phase:CxmjPhase;readonly choiceSeat:number;readonly piaoFen:readonly number[];readonly createRules:Readonly<CxmjRuleSelections>;readonly[field:string]:unknown;}
/** Intent-only: piao normalization, tile inventory, Hu legality, multipliers and settlement are server authoritative. */
export const CXMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('cxmj')!;export const CXMJ_ROUTE='mahjong.cxmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class CxmjGameplayAdapter extends MahjongWaitingExSequentialAdapter<CxmjSnapshot>{constructor(wire:CxmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,CXMJ_REGION_BINDING);}}

