import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface AfmjTransport {
    request<T>(message: string, payload: unknown): Promise<T>;
    on(message: string, handler: (payload: unknown) => void): () => void;
}

export type AfmjOptionalRule =
    | 'JIN_G_BU_NENG_CHI_PENG' | 'CHONG_YI_BAO_SAN'
    | 'BU_CHONG_GUAN_BU_SUAN_JING_FEN' | 'XIAO_JU4_SHE5_RU' | 'BING_DONG_GONG_NENG';

/** Old CAFMJ_CreateRoom and inherited BaseCreateRoom choices, normalized by the native provider. */
export interface AfmjRuleSelections {
    fengding: 150 | 200 | 300 | 500 | 'UNLIMITED';
    wanfa: 'SHANG_XIA_FAN_JING' | 'FAN_SHANG_JING' | 'TUI_JING';
    piaojing: 'BU_PIAO' | 'BO_JING' | 'BI_BO_YI_JING' | 'BI_BO_ZHENG_JING_HUO_LIANG_FU';
    kexuanwanfa: readonly AfmjOptionalRule[];
}

/** Jing derivation, meld legality, floating requirements and settlement remain server-owned. */
export interface AfmjAuthoritativeSnapshot {
    readonly roomId: number;
    readonly gameCode: 'afmj';
    readonly stateVersion: number;
    readonly fengding: number | 'UNLIMITED';
    readonly wanfa: AfmjRuleSelections['wanfa'];
    readonly piaojing: AfmjRuleSelections['piaojing'];
    readonly kexuanwanfa: readonly AfmjOptionalRule[];
    readonly jingIndicator: number;
    readonly jingTiles: readonly number[];
    readonly [field: string]: unknown;
}
export const AFMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('afmj')!;export const AFMJ_ROUTE='mahjong.afmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class AfmjGameplayAdapter extends MahjongStandardDirectAdapter<AfmjAuthoritativeSnapshot>{constructor(wire:AfmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,AFMJ_REGION_BINDING);}}
