import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface FdmjTransport{request<T>(message:string,payload:unknown):Promise<T>;on(message:string,handler:(payload:unknown)=>void):()=>void;}
export type FdmjOption=0;
export interface FdmjRules{playerMinNum:2|3|4;playerNum:2|3|4;setCount:number;paymentRoomCardType:0|1|2;queYise:0|1;kexuanwanfa:readonly FdmjOption[];fangjian:readonly number[];xianShi:number;jiesan:number;gaoji:readonly number[];shuffleSeed?:number;}
export type FdmjPhase='LOBBY'|'PLAYING'|'SETTLED';
export interface FdmjSnapshot{readonly roomId:number;readonly gameCode:'fdmj';readonly stateVersion:number;readonly phase:FdmjPhase;readonly createRules:Readonly<FdmjRules>;readonly jinIndicator:number;readonly jinJinIndicator:number;readonly jins:readonly number[];readonly flowers:Readonly<Record<string,readonly number[]>>;readonly hands:Readonly<Record<string,readonly number[]|{readonly count:number}>>;readonly[field:string]:unknown;}
/** Intent-only adapter. Deal/replacement, indicators, dynamic jin, Hu and settlement are server authoritative. */
export const FDMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('fdmj')!;export const FDMJ_ROUTE='mahjong.fdmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class FdmjGameplayAdapter extends MahjongStandardDirectAdapter{constructor(wire:FdmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,FDMJ_REGION_BINDING);}}

