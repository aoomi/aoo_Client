import{MahjongWaitingExSequentialAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface GdczmjTransport{request<T>(m:string,p:unknown):Promise<T>;}export type GdczmjOption=0|1|2|3|4|5|6|7|8|9;export interface GdczmjSnapshot{gameCode:'gdczmj';stateVersion:number;phase:'LOBBY'|'WAITING_EX'|'PLAYING'|'SETTLED';choiceSeat:number;ghostIndicator:number;ghostTile:number;jiaMai:readonly number[];horseCards:readonly number[];horseHits:Readonly<Record<string,number>>;gangPoints:readonly number[];optionAuthority:Readonly<Record<string,boolean>>;[key:string]:unknown;}/** Intent-only; inventory, ghost, horse draw/hits, Hu gates, caps and settlement are server authoritative. */
export const GDCZMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('gdczmj')!;export const GDCZMJ_ROUTE='mahjong.gdczmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class GdczmjGameplayAdapter extends MahjongWaitingExSequentialAdapter{constructor(wire:GdczmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,GDCZMJ_REGION_BINDING);}}

