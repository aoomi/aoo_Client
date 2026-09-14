import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface HyhsmjTransport{request<T>(message:string,payload:unknown):Promise<T>;}export type HyhsmjBirdMode=0|1|2;export type HyhsmjMissingSuit=0|1|2|3;export type HyhsmjOption=0|1|2|3;
export interface HyhsmjSnapshot{gameCode:'hyhsmj';stateVersion:number;phase:'LOBBY'|'PLAYING'|'SETTLED';jinIndicators:readonly[number,number];jinTiles:readonly[number,number];birdCards:readonly number[];birdHits:Readonly<Record<number,number>>;gangPoints:readonly number[];optionAuthority:{options:readonly HyhsmjOption[];birdMode:HyhsmjBirdMode;reserve:1|5|7};createRules:{zhuaniao:HyhsmjBirdMode;quezhang:HyhsmjMissingSuit};[key:string]:unknown;}
/** Intent-only adapter: dual-jin normalization, bird draw/hits, gang and settlement are server authoritative. */
export const HYHSMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('hyhsmj')!;export const HYHSMJ_ROUTE='mahjong.hyhsmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class HyhsmjGameplayAdapter extends MahjongStandardDirectAdapter<HyhsmjSnapshot>{constructor(wire:HyhsmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,HYHSMJ_REGION_BINDING);}}
