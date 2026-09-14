import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface DzsjzmjTransport{request<T>(message:string,payload:unknown):Promise<T>;on(message:string,handler:(payload:unknown)=>void):()=>void;}
export type DzsjzmjOption=0|1|2|3|4;
export type DzsjzmjDecision='PENDING'|'HU'|'PASS';
export interface DzsjzmjRuleSelections{playerMinNum:2|3|4;playerNum:2|3|4;setCount:number;paymentRoomCardType:0|1|2;wanfa:number;kexuanwanfa:readonly DzsjzmjOption[];feibaofengding:number;baofen:number;fafen:number;fangjian:readonly number[];xianShi:number;tuoguan:number;jiesan:number;gaoji:readonly number[];shuffleSeed?:number;}
export type DzsjzmjPhase='LOBBY'|'WAITING_TUO'|'WAITING_QIAN_PIAO'|'PLAYING'|'WAITING_HU'|'WAITING_HOU_PIAO'|'SETTLED';
export interface DzsjzmjResponseWindow{readonly discarder:number;readonly decisions:Readonly<Record<string,DzsjzmjDecision>>;}
export interface DzsjzmjSnapshot{readonly roomId:number;readonly gameCode:'dzsjzmj';readonly stateVersion:number;readonly phase:DzsjzmjPhase;readonly createRules:Readonly<DzsjzmjRuleSelections>;readonly responseWindow:Readonly<DzsjzmjResponseWindow>|Readonly<Record<string,never>>;readonly winners:readonly number[];readonly hands:Readonly<Record<string,readonly number[]|{readonly count:number}>>;readonly[field:string]:unknown;}
/** Intent-only 19-card adapter. Hu candidates, response priority/timeout and all scoring remain server authoritative. */
export const DZSJZMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('dzsjzmj')!;export const DZSJZMJ_ROUTE='mahjong.dzsjzmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class DzsjzmjGameplayAdapter extends MahjongStandardDirectAdapter{constructor(wire:DzsjzmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,DZSJZMJ_REGION_BINDING);}}

