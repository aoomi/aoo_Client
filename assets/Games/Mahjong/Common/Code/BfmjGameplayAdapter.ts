import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface BfmjTransport {
    request<T>(message: string, payload: unknown): Promise<T>;
    on(message: string, handler: (payload: unknown) => void): () => void;
}

/** Legacy CBFMJ_CreateRoom choices, supplied once when game 386 is created. */
export interface BfmjRuleSelections {
    diFen: 1 | 5 | 10 | 20;
    noWinds: boolean;
    queYiMen: boolean;
    fanJin: boolean;
    qiangGangHu: boolean;
    xiaPao: boolean;
    xiaKou: boolean;
    qingYiSe: boolean;
    baoTing: boolean;
}

export type BfmjPhase = 'WAITING_XIA_PAO' | 'WAITING_XIA_KOU' | 'PLAYING' | 'SETTLED';

/** Hidden tiles, jin derivation, legality, timers and settlement remain server-owned. */
export interface BfmjAuthoritativeSnapshot {
    readonly roomId: number;
    readonly phase: BfmjPhase;
    readonly stateVersion: number;
    readonly choiceSeat: number;
    readonly pao: readonly number[];
    readonly kou: readonly number[];
    readonly baoTing: readonly boolean[];
    readonly indicator: number;
    readonly jinType: number;
    readonly wallRemaining: number;
    readonly delta: Readonly<Record<string, number>>;
    readonly [field: string]: unknown;
}
export const BFMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('bfmj')!;export const BFMJ_ROUTE='mahjong.bfmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class BfmjGameplayAdapter extends MahjongStandardDirectAdapter{constructor(wire:BfmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,BFMJ_REGION_BINDING);}}
