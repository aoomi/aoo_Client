import{MahjongWaitingExSequentialAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface JssqmjTransport{request<T>(message:string,payload:unknown):Promise<T>;}export type JssqmjMode=0|1;export type JssqmjOption=0;export type JssqmjMouseType=0|1|2|3|4;
export interface JssqmjSnapshot{gameCode:'jssqmj';stateVersion:number;phase:'LOBBY'|'WAITING_EX'|'PLAYING'|'SETTLED';choiceSeat:number;mouseTypes:readonly(readonly JssqmjMouseType[])[];mouthPoints:readonly number[];prevailingWind:41|42|43|44;wildcard:47;gangPoints:readonly number[];ruleAuthority:{canOnMouth:boolean;everySetOnMouth:boolean};createRules:{wanfa:JssqmjMode;kexuanwanfa:readonly JssqmjOption[]};[key:string]:unknown;}
/** Intent-only: MouseType scoring, wildcard/wind, operation gates and settlement are server authoritative. */
export const JSSQMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('jssqmj')!;export const JSSQMJ_ROUTE='mahjong.jssqmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class JssqmjGameplayAdapter extends MahjongWaitingExSequentialAdapter{constructor(wire:JssqmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,JSSQMJ_REGION_BINDING);}}

