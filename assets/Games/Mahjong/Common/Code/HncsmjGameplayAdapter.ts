import{MahjongWaitingExSequentialAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface HncsmjTransport { request<T>(message: string, payload: unknown): Promise<T>; }
export type HncsmjPiaoMode=0|1|2;export type HncsmjKaiGang=0|1;export type HncsmjBirdMode=0|1|2;export type HncsmjBirdCount=0|1|2|3;export type HncsmjOption=0|1|2|3|4|5|6|7|8|9|10|11|12|13;
export interface HncsmjSnapshot{gameCode:'hncsmj';stateVersion:number;phase:'LOBBY'|'WAITING_EX'|'PLAYING'|'SETTLED';choiceSeat:number;piao:readonly number[];birdCards:readonly number[];birdHits:Readonly<Record<number,number>>;gangPoints:readonly number[];optionAuthority:{options:readonly HncsmjOption[];piaoMode:HncsmjPiaoMode;fixedPiao:number;kaiGang:HncsmjKaiGang;birdMode:HncsmjBirdMode;birdCount:1|2|4|6};[key:string]:unknown;}
/** Intent-only: piao arbitration, xiaohu, bird draw/hits and settlement are server authoritative. */
export const HNCSMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('hncsmj')!;export const HNCSMJ_ROUTE='mahjong.hncsmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class HncsmjGameplayAdapter extends MahjongWaitingExSequentialAdapter{constructor(wire:HncsmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,HNCSMJ_REGION_BINDING);}}

