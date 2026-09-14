import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface FzjxmjTransport{request<T>(m:string,p:unknown):Promise<T>;}export type FzjxmjOption=0|1|2;export type FzjxmjMaiMa=0|1|2|3;export interface FzjxmjSnapshot{roomId:number;gameCode:'fzjxmj';stateVersion:number;jingIndicator:number;jing:number;horseCards:readonly number[];horseHits:Readonly<Record<string,number>>;gangPoints:readonly number[];honorSequenceEnabled:boolean;[key:string]:unknown;}/** Intent-only; jing, horse tail draw/hits and scoring remain server authoritative. */
export const FZJXMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('fzjxmj')!;export const FZJXMJ_ROUTE='mahjong.fzjxmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class FzjxmjGameplayAdapter extends MahjongStandardDirectAdapter{constructor(wire:FzjxmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,FZJXMJ_REGION_BINDING);}}

