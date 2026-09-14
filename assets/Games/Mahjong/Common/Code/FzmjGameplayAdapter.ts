import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface FzmjTransport{request<T>(m:string,p:unknown):Promise<T>;}export type FzmjOption=0|1|2|3|4|5;export type FzmjDiFen=0|1|2;export interface FzmjSnapshot{roomId:number;gameCode:'fzmj';stateVersion:number;phase:'LOBBY'|'PLAYING'|'SETTLED';jinIndicator:number;jin:number;jins:readonly number[];flowers:Readonly<Record<string,readonly number[]>>;hands:Readonly<Record<string,readonly number[]|{count:number}>>;[key:string]:unknown;}/** Intent-only; 16/17 deal, reserve, jin gates, replacement and settlement are server authoritative. */
export const FZMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('fzmj')!;export const FZMJ_ROUTE='mahjong.fzmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class FzmjGameplayAdapter extends MahjongStandardDirectAdapter<FzmjSnapshot>{constructor(wire:FzmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,FZMJ_REGION_BINDING);}}
