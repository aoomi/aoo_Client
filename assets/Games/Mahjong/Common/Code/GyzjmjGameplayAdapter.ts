import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface GyzjmjTransport {
    request<T>(message: string, payload: unknown): Promise<T>;
    on(message: string, handler: (payload: unknown) => void): () => void;
}

/** Normalized values of old BaseCreateRoom.wanfa and CGYZJMJ_CreateRoom jipai/yinghu. */
export interface GyzjmjRuleSelections {
    wanfa: 'NORMAL' | 'LAIZI';
    jipai: 'MAN_TANG_JI' | 'SHANG_XIA_JI';
    yinghu: 0 | 5 | 10;
}

/** The server owns legal windows, jing exposure, hidden tiles and chicken scoring. */
export interface GyzjmjAuthoritativeSnapshot {
    readonly roomId: number;
    readonly gameCode: 'gyzjmj';
    readonly stateVersion: number;
    readonly wanfa: GyzjmjRuleSelections['wanfa'];
    readonly jipai: GyzjmjRuleSelections['jipai'];
    readonly yinghu: GyzjmjRuleSelections['yinghu'];
    readonly jingIndicator: number;
    readonly jingTiles: readonly number[];
    readonly [field: string]: unknown;
}
export const GYZJMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('gyzjmj')!;export const GYZJMJ_ROUTE='mahjong.gyzjmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class GyzjmjGameplayAdapter extends MahjongStandardDirectAdapter{constructor(wire:GyzjmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,GYZJMJ_REGION_BINDING);}}

