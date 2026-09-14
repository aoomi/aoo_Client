import{MahjongWaitingExSequentialAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface HamjTransport{request<T>(message:string,payload:unknown):Promise<T>;}export type HamjLazi=0|1|2|3|4;export type HamjOption=0|1;export interface HamjSnapshot{gameCode:'hamj';stateVersion:number;phase:'LOBBY'|'WAITING_EX'|'PLAYING'|'SETTLED';hunIndicator:number;hunTile:number;piaoFen:readonly number[];[key:string]:unknown;}/** Intent-only: opening Jin, Hu patterns, OpValue, caps and settlement are server authoritative. */
export const HAMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('hamj')!;export const HAMJ_ROUTE='mahjong.hamj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class HamjGameplayAdapter extends MahjongWaitingExSequentialAdapter<HamjSnapshot>{constructor(wire:HamjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,HAMJ_REGION_BINDING);}}
