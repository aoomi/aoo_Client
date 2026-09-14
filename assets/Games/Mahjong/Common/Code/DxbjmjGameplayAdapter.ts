import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface DxbjmjTransport{request<T>(message:string,payload:unknown):Promise<T>;on(message:string,handler:(payload:unknown)=>void):()=>void;}
/** Exact live ordinals: 0 碰碰胡, 1 不可吃牌. Hidden legacy DTO fields are intentionally absent. */
export type DxbjmjOption=0|1;
export interface DxbjmjRuleSelections{playerMinNum:2|3|4;playerNum:2|3|4;setCount:number;paymentRoomCardType:0|1|2;kexuanwanfa:readonly DxbjmjOption[];fangjian:readonly number[];xianShi:0|1|2|3|4;jiesan:0|1|2|3|4;gaoji:readonly number[];shuffleSeed?:number;}
export type DxbjmjPhase='LOBBY'|'PLAYING'|'SETTLED';
export interface DxbjmjRoundLedger{readonly firstDiscard:readonly number[];readonly discards:number;readonly melds:number;readonly liabilitySeat:number;}
export interface DxbjmjSnapshot{readonly roomId:number;readonly gameCode:'dxbjmj';readonly stateVersion:number;readonly phase:DxbjmjPhase;readonly jinIndicator:number;readonly jinJinIndicator:number;readonly jing:readonly number[];readonly wallReserve:34;readonly specialPoints:readonly number[];readonly roundLedger:Readonly<DxbjmjRoundLedger>;readonly createRules:Readonly<DxbjmjRuleSelections>;readonly[field:string]:unknown;}
/** Intent-only adapter. Jing opening, Hu legality, gang/jing scoring, liability and settlement are server authoritative. */
export const DXBJMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('dxbjmj')!;export const DXBJMJ_ROUTE='mahjong.dxbjmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class DxbjmjGameplayAdapter extends MahjongStandardDirectAdapter{constructor(wire:DxbjmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,DXBJMJ_REGION_BINDING);}}

