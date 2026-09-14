import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface FxmjTransport{request<T>(m:string,p:unknown):Promise<T>;}export type FxmjOption=0|1|2|3|4|5|6|7|8|9|10|11|12;export interface FxmjRules{playerMinNum:2|3|4;playerNum:2|3|4;setCount:number;paymentRoomCardType:0|1|2;fengDing:number;kexuanwanfa:readonly FxmjOption[];fangjian:readonly number[];xianShi:number;jiesan:number;gaoji:readonly number[];}export interface FxmjSnapshot{roomId:number;gameCode:'fxmj';stateVersion:number;createRules:Readonly<FxmjRules>;dealerSeat:number;openCounts:readonly number[];gangPoints:readonly number[];passedHu:readonly number[];zhaHuDelta:Readonly<Record<string,number>>;optionAuthority:Readonly<Record<string,unknown>>;[key:string]:unknown;}/** Intent-only; all option gates, Hu patterns, caps and settlement remain server authoritative. */
export const FXMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('fxmj')!;export const FXMJ_ROUTE='mahjong.fxmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class FxmjGameplayAdapter extends MahjongStandardDirectAdapter{constructor(wire:FxmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,FXMJ_REGION_BINDING);}}

