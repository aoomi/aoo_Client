import{MahjongWaitingExSequentialAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface HbwhmjTransport{request<T>(message:string,payload:unknown):Promise<T>;}export type HbwhmjWanFa=0|1|2;export type HbwhmjMode=0|1;export type HbwhmjQiHu=0|1|2|3;export type HbwhmjCap=0|1|2;export type HbwhmjOption=0;export interface HbwhmjSnapshot{gameCode:'hbwhmj';stateVersion:number;phase:'LOBBY'|'WAITING_EX'|'PLAYING'|'SETTLED';gangPoints:readonly number[];[key:string]:unknown;}/** Intent-only: 留10张 reserve, 258 pair, open-mouth, minimum Hu, cap, legal operations and settlement are server authoritative. */
export const HBWHMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('hbwhmj')!;export const HBWHMJ_ROUTE='mahjong.hbwhmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class HbwhmjGameplayAdapter extends MahjongWaitingExSequentialAdapter<HbwhmjSnapshot>{constructor(wire:HbwhmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,HBWHMJ_REGION_BINDING);}}
