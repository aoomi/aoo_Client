import{MahjongWaitingExSequentialAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface HnxymjTransport{request<T>(message:string,payload:unknown):Promise<T>;}export type HnxymjHuFa=0|1|2;export type HnxymjWanFa=0|1|2;export type HnxymjDaZui=0|1|2;export type HnxymjFengPai=0|1;export type HnxymjCap=0|1|2;export type HnxymjOption=0|1|2;export interface HnxymjSnapshot{gameCode:'hnxymj';stateVersion:number;phase:'LOBBY'|'WAITING_EX'|'PLAYING'|'SETTLED';choiceSeat:number;kan:readonly number[];gangPoints:readonly number[];optionAuthority:{options:readonly HnxymjOption[];huFa:HnxymjHuFa;wanFa:HnxymjWanFa;daZui:0|2|5;winds:boolean;cap:0|20|40;kanPai:boolean;siMenQing:boolean;luanSanFeng:boolean};[key:string]:unknown;}/** Intent-only: kan, hu mode, patterns, da-zui, caps and settlement remain server authoritative. */
export const HNXYMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('hnxymj')!;export const HNXYMJ_ROUTE='mahjong.hnxymj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class HnxymjGameplayAdapter extends MahjongWaitingExSequentialAdapter{constructor(wire:HnxymjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,HNXYMJ_REGION_BINDING);}}

