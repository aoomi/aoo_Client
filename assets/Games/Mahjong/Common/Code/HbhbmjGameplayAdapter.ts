import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface HbhbmjTransport{request<T>(message:string,payload:unknown):Promise<T>;}export type HbhbmjOption=0|1|2|3|4;export type HbhbmjJiaFen=0|1|2|3|4;export type HbhbmjDecision='PENDING'|'HU'|'PASS';export interface HbhbmjSnapshot{gameCode:'hbhbmj';stateVersion:number;phase:'LOBBY'|'PLAYING'|'WAITING_HU'|'SETTLED';responseWindow?:{discarder:number;decisions:Readonly<Record<string,HbhbmjDecision>>};gangPoints:readonly number[];[key:string]:unknown;}/** Intent-only: inventory, Chi gate, responder eligibility, gang liability, dealer multiplier, patterns and settlement are server authoritative. */
export const HBHBMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('hbhbmj')!;export const HBHBMJ_ROUTE='mahjong.hbhbmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class HbhbmjGameplayAdapter extends MahjongStandardDirectAdapter{constructor(wire:HbhbmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,HBHBMJ_REGION_BINDING);}}

