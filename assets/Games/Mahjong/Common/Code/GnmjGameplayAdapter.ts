import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface GnmjTransport {
    request<T>(message: string, payload: unknown): Promise<T>;
    on(message: string, handler: (payload: unknown) => void): () => void;
}

/** Exact game-private fields from old CGNMJ_CreateRoom. */
export interface GnmjRuleSelections {
    /** Index into legacy horse counts: 0, 2, 3, 4, 6, 8. */
    maima: 0 | 1 | 2 | 3 | 4 | 5;
    /** 0 rewards the dealer on a draw; 1 penalizes the dealer. */
    zhuangjia: 0 | 1;
}

/** The server owns jin derivation, legal windows, scoring and hidden tiles. */
export interface GnmjAuthoritativeSnapshot {
    readonly roomId: number;
    readonly gameCode: 'gnmj';
    readonly stateVersion: number;
    readonly maima: number;
    readonly zhuangjia: number;
    readonly jinIndicator: number;
    readonly jinTiles: readonly number[];
    readonly [field: string]: unknown;
}
export const GNMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('gnmj')!;export const GNMJ_ROUTE='mahjong.gnmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class GnmjGameplayAdapter extends MahjongStandardDirectAdapter{constructor(wire:GnmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,GNMJ_REGION_BINDING);}}

