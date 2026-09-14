import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface HfmjTransport { request<T>(message: string, payload: unknown): Promise<T>; }
export type HfmjNaoZhuang = 0 | 1 | 2 | 3 | 4;
export type HfmjOption = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export interface HfmjRuleAuthority {
    allowDiscardHu: boolean;
    allowPeng: boolean;
    allowExposedGang: boolean;
    naoZhuangPoints: 0 | 5 | 10 | 15 | 20;
    options: readonly HfmjOption[];
}
export interface HfmjSnapshot {
    gameCode: 'hfmj';
    stateVersion: number;
    phase: 'LOBBY' | 'PLAYING' | 'SETTLED';
    ruleAuthority: HfmjRuleAuthority;
    gangPoints?: readonly number[];
    createRules?: { naozhuang: HfmjNaoZhuang; kexuanwanfa: readonly HfmjOption[]; [key: string]: unknown };
    [key: string]: unknown;
}

/** Intent-only adapter: all hu gates, Ba-Zhi patterns, OpPoints and settlement remain authoritative. */
export const HFMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('hfmj')!;export const HFMJ_ROUTE='mahjong.hfmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class HfmjGameplayAdapter extends MahjongStandardDirectAdapter<HfmjSnapshot>{constructor(wire:HfmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,HFMJ_REGION_BINDING);}}
