import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface GdmjTransport{request<T>(message:string,payload:unknown):Promise<T>;}export type GdmjOption=0|1|2|3|4|5;export type GdmjHorseMode=0|1|2;export type GdmjHorseCount=-1|0|1|2;export interface GdmjSnapshot{gameCode:'gdmj';stateVersion:number;phase:'LOBBY'|'PLAYING'|'SETTLED';dealerSeat:number;horseCards:readonly number[];horseHitCards:readonly number[];gangPoints:readonly number[];optionAuthority:Readonly<Record<string,boolean>>;[key:string]:unknown;}/** Intent-only: legal operations, horse draw/hits, gang ledger, dealer, cap and settlement are server authoritative. */
export const GDMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('gdmj')!;export const GDMJ_ROUTE='mahjong.gdmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class GdmjGameplayAdapter extends MahjongStandardDirectAdapter<GdmjSnapshot>{constructor(wire:GdmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,GDMJ_REGION_BINDING);}}
