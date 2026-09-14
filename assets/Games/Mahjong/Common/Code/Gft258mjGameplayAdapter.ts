import{MahjongWaitingExSequentialAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface Gft258mjTransport{request<T>(message:string,payload:unknown):Promise<T>;}export type Gft258mjOption=0|1;export type Gft258mjHuMode=0|1;export type Gft258mjCap=0|1|2;export interface Gft258mjSnapshot{gameCode:'gft258mj';stateVersion:number;phase:'LOBBY'|'WAITING_EX'|'PLAYING'|'SETTLED';gangPoints:readonly number[];optionAuthority:{daiFeng:boolean;jiang258:boolean;huPaiFangShi:number;fengDing:number};[key:string]:unknown;}/** Intent-only: deck composition, Jiang-258 win gate, must-Hu mode, cap, gang ledger and settlement are server authoritative. */
export const GFT258MJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('gft258mj')!;export const GFT258MJ_ROUTE='mahjong.gft258mj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class Gft258mjGameplayAdapter extends MahjongWaitingExSequentialAdapter{constructor(wire:Gft258mjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,GFT258MJ_REGION_BINDING);}}

