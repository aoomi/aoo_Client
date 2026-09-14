import{MahjongWaitingExSequentialAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface HtmjTransport { request<T>(message:string,payload:unknown):Promise<T>; }
export type HtmjJiaMaMode=0|1|2;export type HtmjBirdMode=0|1|2;export type HtmjBirdScoreMode=0|1;export type HtmjOption=0|1|2|3|4;
export interface HtmjSnapshot{gameCode:'htmj';stateVersion:number;phase:'LOBBY'|'WAITING_EX'|'PLAYING'|'SETTLED';choiceSeat:number;jiaMa:readonly number[];birdCards:readonly number[];birdHits:Readonly<Record<number,number>>;gangPoints:readonly number[];optionAuthority:{options:readonly HtmjOption[];jiaMaMode:HtmjJiaMaMode;forcedJiaMa:0|1;birdMode:HtmjBirdMode;birdCount:1|2|3;birdScoreMode:HtmjBirdScoreMode};[key:string]:unknown;}
/** Intent-only adapter: jia-ma arbitration, winning-hand legality, birds, hits and scoring remain server authoritative. */
export const HTMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('htmj')!;export const HTMJ_ROUTE='mahjong.htmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class HtmjGameplayAdapter extends MahjongWaitingExSequentialAdapter<HtmjSnapshot>{constructor(wire:HtmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,HTMJ_REGION_BINDING);}jiaMa(seat:number,value:0|1){return this.intent(seat,'jiaMa',{value});}timeout(seat:number){return this.intent(seat,'timeout',{});}}
