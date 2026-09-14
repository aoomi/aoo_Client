import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface JlmjTransport{request<T>(message:string,payload:unknown):Promise<T>;}export type JlmjMode=0|1|2;export type JlmjCap=0|1|2|3;export type JlmjOption=0|1|2|3|4|5|6|7;
export interface JlmjSnapshot{gameCode:'jlmj';stateVersion:number;phase:'LOBBY'|'PLAYING'|'SETTLED';treasure:number;reserve:number;gangPoints:readonly number[];eggCounts:readonly number[];ruleAuthority:{wanfa:JlmjMode;cap:16|32|48|64;bigEggCap:boolean;discardAllPay:boolean;smallChickenFlyingEgg:boolean;fastTreasure:boolean;terminalEgg:boolean;oneHandDouble:boolean;terminalEggThreeSuits:boolean;rotateDealer:boolean};createRules:{wanfa:JlmjMode;fengDing:JlmjCap;kexuanwanfa:readonly JlmjOption[]};[key:string]:unknown;}
/** Intent-only: treasure, flowers, egg/gang ledgers, reserve, dealer and settlement are server authoritative. */
export const JLMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('jlmj')!;export const JLMJ_ROUTE='mahjong.jlmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class JlmjGameplayAdapter extends MahjongStandardDirectAdapter{constructor(wire:JlmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,JLMJ_REGION_BINDING);}}

