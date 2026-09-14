import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface RjmjTransport {
    request<T>(message: string, payload: unknown): Promise<T>;
    on(message: string, handler: (payload: unknown) => void): () => void;
}

/** Exact four old RJMJKeXuanWanFa choices, normalized to the server contract. */
export type RjmjOptionalRule = 'KE_DIAN_PAO' | 'FEN_ZHUANG_XIAN' | 'LIAN_ZHUANG_FEN' | 'GEN_ZHUANG_FEN';

export interface RjmjRuleSelections {
    kexuanwanfa: readonly RjmjOptionalRule[];
}

/** Jin derivation, legal windows, hidden tiles and settlement remain server-owned. */
export interface RjmjAuthoritativeSnapshot {
    readonly roomId: number;
    readonly gameCode: 'rjmj';
    readonly stateVersion: number;
    readonly kexuanwanfa: readonly RjmjOptionalRule[];
    readonly jingIndicator: number;
    readonly jingTiles: readonly number[];
    readonly [field: string]: unknown;
}
export const RJMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('rjmj')!;export const RJMJ_ROUTE='mahjong.rjmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class RjmjGameplayAdapter extends MahjongStandardDirectAdapter{constructor(wire:RjmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,RJMJ_REGION_BINDING);}}

