import{MahjongWaitingExSequentialAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface CxyxmjTransport{request<T>(message:string,payload:unknown):Promise<T>;on(message:string,handler:(payload:unknown)=>void):()=>void;}
/** 0可放炮,1海底/摇色算自摸,2最多双大胡,3缺一门,4缺一色,5板板胡,6俱乐部积分不低于0,7带多少只赢多少. */export type CxyxmjOption=0|1|2|3|4|5|6|7;
export interface CxyxmjRuleSelections{playerMinNum:2|3|4;playerNum:2|3|4;setCount:number;paymentRoomCardType:0|1|2;fengDing:0|1|2|3;fengpai:0|1;dianpao:0|1;qidui:0|1;gangpai:0|1;wanfa:0|1;kexuanwanfa:readonly CxyxmjOption[];fangjian:readonly number[];xianShi:0|1|2|3|4;jiesan:0|1|2|3|4;gaoji:readonly number[];shuffleSeed?:number;}
export type CxyxmjPhase='LOBBY'|'WAITING_EX'|'PLAYING'|'SETTLED';export interface CxyxmjSnapshot{readonly roomId:number;readonly gameCode:'cxyxmj';readonly stateVersion:number;readonly phase:CxyxmjPhase;readonly choiceSeat:number;readonly piaoFen:readonly number[];readonly createRules:Readonly<CxyxmjRuleSelections>;readonly[field:string]:unknown;}
/** Intent-only: piao normalization, tile inventory, Hu legality, multipliers and settlement are server authoritative. */
export const CXYXMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('cxyxmj')!;export const CXYXMJ_ROUTE='mahjong.cxyxmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class CxyxmjGameplayAdapter extends MahjongWaitingExSequentialAdapter<CxyxmjSnapshot>{constructor(wire:CxyxmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,CXYXMJ_REGION_BINDING);}}

