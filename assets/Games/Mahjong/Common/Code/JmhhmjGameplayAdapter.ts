import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface JmhhmjTransport{request<T>(message:string,payload:unknown):Promise<T>;}export type JmhhmjBase=0|1|2|3|4;export type JmhhmjMode=0|1|2|3;export type JmhhmjOption=0|1|2|3;
export interface JmhhmjSnapshot{gameCode:'jmhhmj';stateVersion:number;phase:'LOBBY'|'PLAYING'|'SETTLED';indicator:number;laiZi:number;reserve:14;gangPoints:readonly number[];ruleAuthority:{diFen:1|2|5|3|4;chi:boolean;autoReady:boolean;removeWan:boolean;characterSelfDraw:boolean;shuaiCharacterDiscardHu:boolean};createRules:{diFen:JmhhmjBase;wanfa:JmhhmjMode;kexuanwanfa:readonly JmhhmjOption[]};[key:string]:unknown;}
/** Intent-only: inventory, indicator/laiZi, win legality, gang and settlement are server authoritative. */
export const JMHHMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('jmhhmj')!;export const JMHHMJ_ROUTE='mahjong.jmhhmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class JmhhmjGameplayAdapter extends MahjongStandardDirectAdapter{constructor(wire:JmhhmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,JMHHMJ_REGION_BINDING);}}

