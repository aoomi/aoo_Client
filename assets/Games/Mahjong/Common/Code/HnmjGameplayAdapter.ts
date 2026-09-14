import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface HnmjTransport {
    request<T>(message: string, payload: unknown): Promise<T>;
    on(message: string, handler: (payload: unknown) => void): () => void;
}

export type HnmjOptionalRule =
    | 'ZHUANG_XIAN' | 'LIAN_ZHUANG' | 'SHANG_GA' | 'LIU_JU_SUAN_FEN'
    | 'HUA_HU' | 'FAN_GOU_JIAO' | 'ZI_YOU_SHANG_GA' | 'WU_ZI_PAI'
    | 'BU_KE_CHI' | 'HAI_DI_BAO_PAI' | 'JIAO_LING' | 'BU_KE_DIAN_PAO';

/** Old CHNMJ_CreateRoom fields plus normalized inherited BaseCreateRoom selections. */
export interface HnmjRuleSelections {
    fengDing: 8 | 12 | 16;
    laizi: 'WU_LAI_ZI' | 'SUI_JI_LAI_ZI' | 'HONG_ZHONG_LAI_ZI';
    wanfa: 'YOU_FAN' | 'WU_FAN';
    kexuanwanfa: readonly HnmjOptionalRule[];
}

/** Legal windows, hidden tiles, jing selection and settlement are server-owned. */
export interface HnmjAuthoritativeSnapshot {
    readonly roomId: number;
    readonly gameCode: 'hnmj';
    readonly stateVersion: number;
    readonly fengDing: number;
    readonly laizi: HnmjRuleSelections['laizi'];
    readonly wanfa: HnmjRuleSelections['wanfa'];
    readonly kexuanwanfa: readonly HnmjOptionalRule[];
    readonly jingIndicator: number;
    readonly jingTiles: readonly number[];
    readonly [field: string]: unknown;
}
export const HNMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('hnmj')!;export const HNMJ_ROUTE='mahjong.hnmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class HnmjGameplayAdapter extends MahjongStandardDirectAdapter{constructor(wire:HnmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,HNMJ_REGION_BINDING);}}

