import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface HfbzmjTransport { request<T>(message: string, payload: unknown): Promise<T>; }
export type HfbzmjHuMode = 0 | 1;
export type HfbzmjNaoZhuang = 0 | 1 | 2 | 3 | 4 | 5;
export interface HfbzmjRuleAuthority {
    allowDiscardHu: boolean;
    selfDrawOnly: boolean;
    naoZhuangPoints: 0 | 5 | 10 | 20 | 40 | 80;
}
export interface HfbzmjSnapshot {
    gameCode: 'hfbzmj';
    stateVersion: number;
    phase: 'LOBBY' | 'PLAYING' | 'SETTLED';
    ruleAuthority: HfbzmjRuleAuthority;
    gangPoints?: readonly number[];
    createRules?: { hupaifangshi: HfbzmjHuMode; naozhuang: HfbzmjNaoZhuang; [key: string]: unknown };
    [key: string]: unknown;
}

/** Intent-only adapter: hu legality, Ba-Zhi OpPoints, nao-zhuang and settlement stay server authoritative. */
export const HFBZMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('hfbzmj')!;export const HFBZMJ_ROUTE='mahjong.hfbzmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class HfbzmjGameplayAdapter extends MahjongStandardDirectAdapter{constructor(wire:HfbzmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,HFBZMJ_REGION_BINDING);}}

