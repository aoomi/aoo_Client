import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface GamjTransport{request<T>(m:string,p:unknown):Promise<T>;}export type GamjOption=0;export type GamjDecision='PENDING'|'HU'|'PASS';export interface GamjSnapshot{roomId:number;gameCode:'gamj';stateVersion:number;phase:'LOBBY'|'PLAYING'|'WAITING_HU'|'SETTLED';winners:readonly number[];responseWindow:Readonly<{discarder:number;decisions:Readonly<Record<string,GamjDecision>>}>|Readonly<Record<string,never>>;gangPoints:readonly number[];managedAutoHu:boolean;roomLimitSeconds:number;[key:string]:unknown;}/** Intent-only; Hu candidates/priority, multi-winner resolution, gang ledger, caps and settlement are server authoritative. */
export const GAMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('gamj')!;export const GAMJ_ROUTE='mahjong.gamj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class GamjGameplayAdapter extends MahjongStandardDirectAdapter{constructor(wire:GamjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,GAMJ_REGION_BINDING);}}

