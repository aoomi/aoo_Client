import{MahjongWaitingExSequentialAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface HbyxmjTransport{request<T>(message:string,payload:unknown):Promise<T>;}export type HbyxmjDiFen=0|1|2|3;export type HbyxmjCap=0|1|2|3;export type HbyxmjMode=0|1;export type HbyxmjWanFa=0|1|2;export type HbyxmjOption=0|1|2|3|4|5|6;export interface HbyxmjSnapshot{gameCode:'hbyxmj';stateVersion:number;phase:'LOBBY'|'WAITING_EX'|'PLAYING'|'SETTLED';hunIndicator:number;hunTile:number;gangPoints?:readonly number[];[key:string]:unknown;}/** Intent-only: opening Jin, 258 gate, patterns, laizi-gang score, caps and settlement are server authoritative. */
export const HBYXMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('hbyxmj')!;export const HBYXMJ_ROUTE='mahjong.hbyxmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class HbyxmjGameplayAdapter extends MahjongWaitingExSequentialAdapter{constructor(wire:HbyxmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,HBYXMJ_REGION_BINDING);}}

