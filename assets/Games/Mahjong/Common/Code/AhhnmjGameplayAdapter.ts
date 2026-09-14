import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface AhhnmjTransport {
    request<T>(message: string, payload: unknown): Promise<T>;
    on(message: string, handler: (payload: unknown) => void): () => void;
}

/** Exact live AHHNMJ create contract; numeric values preserve the legacy client selections. */
export interface AhhnmjRuleSelections {
    jushu: 0 | 1 | 2;
    renshu: 2 | 3 | 4;
    fangfei: 0 | 1 | 2;
    /** 0 enables the pre-play jiao-zui choice; 1 disables it. */
    jiaozui: 0 | 1;
    /** 0 连庄倒, 1 抢杠全包, 2 闹. */
    kexuanwanfa: readonly (0 | 1 | 2)[];
    fangjian: readonly (0 | 1 | 2)[];
    xianShi: 0 | 1 | 2 | 3 | 4;
    jiesan: 0 | 1 | 2 | 3 | 4;
    gaoji: readonly (0 | 1 | 2 | 3 | 4 | 5 | 6)[];
}

export type AhhnmjPhase = 'WAITING' | 'JIAO_ZUI' | 'NAO' | 'INIT' | 'PLAYING' | 'FINISHED';

/** Legal operations, hidden tiles, choice effects, scoring and settlement remain server-owned. */
export interface AhhnmjAuthoritativeSnapshot {
    readonly roomId: number;
    readonly gameCode: 'ahhnmj';
    readonly stateVersion: number;
    readonly phase: AhhnmjPhase;
    readonly createRules: Readonly<AhhnmjRuleSelections>;
    readonly jiaoChoices: Readonly<Record<string, 0 | 1>>;
    readonly naoChoices: Readonly<Record<string, 0 | 1>>;
    readonly [field: string]: unknown;
}
export const AHHNMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('ahhnmj')!;export const AHHNMJ_ROUTE='mahjong.ahhnmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class AhhnmjGameplayAdapter extends MahjongStandardDirectAdapter<AhhnmjAuthoritativeSnapshot>{constructor(wire:AhhnmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,AHHNMJ_REGION_BINDING);}}
