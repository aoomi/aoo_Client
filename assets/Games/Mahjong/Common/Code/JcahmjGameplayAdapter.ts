import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface JcahmjTransport{request<T>(message:string,payload:unknown):Promise<T>;}export type JcahmjHorseMode=0|1|2|3;export type JcahmjOption=0|1|2|3;
export interface JcahmjSnapshot{gameCode:'jcahmj';stateVersion:number;phase:'LOBBY'|'PLAYING'|'SETTLED';gangPoints:readonly number[];openingFlowers?:readonly number[];openingReplacements?:readonly unknown[];ruleAuthority:{peimaMode:JcahmjHorseMode;bottomHorse:0|4|5|6|7|8|9|10|11|12|13|14;reserve:number};createRules:{peimafangshi:JcahmjHorseMode;dima:-1|0|1|2|3|4|5|6|7|8|9|10;kexuanwanfa:readonly JcahmjOption[]};[key:string]:unknown;}
/** Intent-only: flower replacement, tail-horse allocation/hits and settlement are server authoritative. */
export const JCAHMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('jcahmj')!;export const JCAHMJ_ROUTE='mahjong.jcahmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class JcahmjGameplayAdapter extends MahjongStandardDirectAdapter{constructor(wire:JcahmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,JCAHMJ_REGION_BINDING);}}

