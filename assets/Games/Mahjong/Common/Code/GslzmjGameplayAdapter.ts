import{MahjongWaitingExSequentialAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface GslzmjTransport{request<T>(message:string,payload:unknown):Promise<T>;}export type GslzmjMode=0|1|2|3|4;export type GslzmjShuaiMode=0|1|2;export type GslzmjGangMode=0|1;export type GslzmjOption=0|1|2|3|4;export interface GslzmjSnapshot{gameCode:'gslzmj';stateVersion:number;phase:'LOBBY'|'WAITING_EX'|'PLAYING'|'SETTLED';choiceSeat:number;treasureCards:readonly number[];shuaiChoices:readonly number[];gangPoints:readonly number[];optionAuthority:Readonly<Record<string,boolean>>;[key:string]:unknown;}/** Intent-only: treasures, shuai eligibility, legal operations, gang scores and settlement are server authoritative. */
export const GSLZMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('gslzmj')!;export const GSLZMJ_ROUTE='mahjong.gslzmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class GslzmjGameplayAdapter extends MahjongWaitingExSequentialAdapter{constructor(wire:GslzmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,GSLZMJ_REGION_BINDING);}}

