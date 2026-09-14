import{MahjongWaitingExSequentialAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface GdjymjTransport{request<T>(message:string,payload:unknown):Promise<T>;}
export type GdjymjOption=0|1|2|3|4|5|6|7|8|9|10;
/** Server create-room ordinal: no horse, 1/2/3 horses, penalty one/two horses. */
export type GdjymjBuyHorseMode=0|1|2|3|4|5;
export type GdjymjPhase='LOBBY'|'WAITING_EX'|'PLAYING'|'SETTLED';
export interface GdjymjSnapshot{
  gameCode:'gdjymj';stateVersion:number;phase:GdjymjPhase;choiceSeat:number;
  ghostIndicator:number;ghostTile:number;jiaMai:readonly number[];
  horseCards:readonly number[];horseHits:Readonly<Record<string,number>>;
  gangPoints:readonly number[];optionAuthority:Readonly<Record<string,boolean>>;
  [key:string]:unknown;
}
/** Intent-only: ghost, legal operations, horse tail/hits, gang ledger, caps and settlement stay authoritative on the server. */
export const GDJYMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('gdjymj')!;export const GDJYMJ_ROUTE='mahjong.gdjymj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class GdjymjGameplayAdapter extends MahjongWaitingExSequentialAdapter{constructor(wire:GdjymjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,GDJYMJ_REGION_BINDING);}}

