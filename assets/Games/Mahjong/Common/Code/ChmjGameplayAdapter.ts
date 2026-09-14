import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface ChmjTransport{request<T>(message:string,payload:unknown):Promise<T>;on(message:string,handler:(payload:unknown)=>void):()=>void;}
/** 0天胡,1断对,2十一支. */export type ChmjOption=0|1|2;
export interface ChmjRuleSelections{playerMinNum:2|3|4;playerNum:2|3|4;setCount:number;paymentRoomCardType:0|1|2;piaozi:0|1|2;/** 1=30锅,2=50锅,3=100锅. */sign:1|2|3;kexuanwanfa:readonly ChmjOption[];fangjian:readonly number[];xianShi:0|1|2|3|4;jiesan:0|1|2|3|4;gaoji:readonly number[];shuffleSeed?:number;}
export type ChmjPhase='LOBBY'|'PLAYING'|'SETTLED';
export interface ChmjSnapshot{readonly roomId:number;readonly gameCode:'chmj';readonly stateVersion:number;readonly phase:ChmjPhase;readonly piaoValue:5|10|20;readonly potType:30|50|100;readonly createRules:Readonly<ChmjRuleSelections>;readonly[field:string]:unknown;}
/** Intent-only: OpValue, pattern recognition, pot matrix, scoring and settlement are server authoritative. */
export const CHMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('chmj')!;export const CHMJ_ROUTE='mahjong.chmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class ChmjGameplayAdapter extends MahjongStandardDirectAdapter<ChmjSnapshot>{constructor(wire:ChmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,CHMJ_REGION_BINDING);}}

