import{MahjongWaitingExSequentialAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface HnhbmjTransport{request<T>(message:string,payload:unknown):Promise<T>;}export type HnhbmjXiaPao=0|1;export type HnhbmjBirdMode=0|1|2|3;export type HnhbmjHuBase=0|1;export type HnhbmjGangMode=0|1;export type HnhbmjOption=0|1|2|3|4;export interface HnhbmjSnapshot{gameCode:'hnhbmj';stateVersion:number;phase:'LOBBY'|'WAITING_EX'|'PLAYING'|'SETTLED';choiceSeat:number;piao:readonly number[];birdCards:readonly number[];birdHits:Readonly<Record<number,number>>;gangPoints:readonly number[];optionAuthority:{options:readonly HnhbmjOption[];xiaPao:boolean;huBase:1|2;zhiGang:number;anGang:1|2;birdMode:HnhbmjBirdMode;birdCount:0|1|3|6;redCenterWildcard:boolean};[key:string]:unknown;}/** Intent-only: laizi, hu gates, bird hits, gang scores and settlement are server authoritative. */
export const HNHBMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('hnhbmj')!;export const HNHBMJ_ROUTE='mahjong.hnhbmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class HnhbmjGameplayAdapter extends MahjongWaitingExSequentialAdapter{constructor(wire:HnhbmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,HNHBMJ_REGION_BINDING);}}

