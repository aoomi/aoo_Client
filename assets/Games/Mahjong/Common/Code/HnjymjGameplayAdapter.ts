import{MahjongWaitingExSequentialAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface HnjymjTransport{request<T>(message:string,payload:unknown):Promise<T>;}export type HnjymjWanFa=0|1|2;export type HnjymjHuFa=0|1;export type HnjymjXuanPao=0|1|2|3|4|5|6|7;export type HnjymjOption=0|1|2|3;export interface HnjymjSnapshot{gameCode:'hnjymj';stateVersion:number;phase:'LOBBY'|'WAITING_EX'|'PLAYING'|'SETTLED';choiceSeat:number;piao:readonly number[];gangPoints:readonly number[];optionAuthority:{options:readonly HnjymjOption[];wanFa:HnjymjWanFa;huFa:HnjymjHuFa;xuanPao:HnjymjXuanPao;paoMin:number;fixedPao:number;winds:boolean;passPeng:boolean;gangFlowerDouble:boolean;sevenPairs:boolean};[key:string]:unknown;}/** Intent-only: hu, pass-peng, gang-flower, seven-pairs and settlement are server authoritative. */
export const HNJYMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('hnjymj')!;export const HNJYMJ_ROUTE='mahjong.hnjymj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class HnjymjGameplayAdapter extends MahjongWaitingExSequentialAdapter{constructor(wire:HnjymjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,HNJYMJ_REGION_BINDING);}}

