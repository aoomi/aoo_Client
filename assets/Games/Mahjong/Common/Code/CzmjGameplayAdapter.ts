import{MahjongWaitingExSequentialAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface CzmjTransport{request<T>(message:string,payload:unknown):Promise<T>;on(message:string,handler:(payload:unknown)=>void):()=>void;}
/** 0带混, 1带风牌, 2清一色, 3一条龙, 4十三不靠, 5缺门加分. */export type CzmjOption=0|1|2|3|4|5;
export interface CzmjRuleSelections{playerMinNum:4;playerNum:4;setCount:number;paymentRoomCardType:0|1|2;dianpao:0|1;kexuanwanfa:readonly CzmjOption[];fangjian:readonly number[];xianShi:0|1|2|3|4;jiesan:0|1|2|3|4;gaoji:readonly number[];shuffleSeed?:number;}
export type CzmjPhase='LOBBY'|'WAITING_EX'|'PLAYING'|'SETTLED';export interface CzmjSnapshot{readonly roomId:number;readonly gameCode:'czmj';readonly stateVersion:number;readonly phase:CzmjPhase;readonly choiceSeat:number;readonly piaoFen:readonly number[];readonly hunIndicator:number;readonly hunTile:number;readonly createRules:Readonly<CzmjRuleSelections>;readonly[field:string]:unknown;}
/** Intent-only: piao normalization, tile inventory, Hu legality, multipliers and settlement are server authoritative. */
export const CZMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('czmj')!;export const CZMJ_ROUTE='mahjong.czmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class CzmjGameplayAdapter extends MahjongWaitingExSequentialAdapter{constructor(wire:CzmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,CZMJ_REGION_BINDING);}}

