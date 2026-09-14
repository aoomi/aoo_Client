import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface GzmjTransport {
    request<T>(message: string, payload: unknown): Promise<T>;
    on(message: string, handler: (payload: unknown) => void): () => void;
}

/** Exact game-private fields from the old CGZMJ_CreateRoom contract. */
export interface GzmjRuleSelections {
    pinghu: boolean;
    jiaozui: boolean;
    chujingjiangli: boolean;
    hupaidifen: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
}

/** Legal windows, jing derivation, hidden tiles and settlement remain server-owned. */
export interface GzmjAuthoritativeSnapshot {
    readonly roomId: number;
    readonly gameCode: 'gzmj';
    readonly stateVersion: number;
    readonly pinghu: boolean;
    readonly jiaozui: boolean;
    readonly chujingjiangli: boolean;
    readonly hupaidifen: number;
    readonly jingIndicator: number;
    readonly jingTiles: readonly number[];
    readonly [field: string]: unknown;
}
export const GZMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('gzmj')!;export const GZMJ_ROUTE='mahjong.gzmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class GzmjGameplayAdapter extends MahjongStandardDirectAdapter{constructor(wire:GzmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,GZMJ_REGION_BINDING);}}

