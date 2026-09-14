import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface BdjhmjTransport { request<T>(message: string, payload: unknown): Promise<T>; on(message: string, handler: (payload: unknown) => void): () => void; }
/** Exact live CBDJHMJ_CreateRoom/client selection contract. */
export interface BdjhmjRuleSelections {
    /** 不买马, 2/4/6/8/10/12马. */ mapai: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    /** 0=159中马. */ zhongmafangshi: 0;
    /** 无鬼, 2/4/6/8鬼. */ guipai: 0 | 1 | 2 | 3 | 4;
    /** 0启用十三幺, 1关闭. */ shisanyao: 0 | 1;
    /** 0无七对, 1七对, 2七对×2. */ qidui: 0 | 1 | 2;
    playerMinNum: 2 | 3 | 4; playerNum: 2 | 3 | 4; setCount: number; paymentRoomCardType: 0 | 1 | 2;
    /** 无花加倍, 留马, 摸到即出, 赢家只得当前分, 俱乐部积分不低于0. */ kexuanwanfa: readonly (0 | 1 | 2 | 3 | 4)[];
    fangjian: readonly (0 | 1 | 2 | 3 | 4 | 5 | 6)[]; xianShi: 0 | 1 | 2 | 3 | 4; jiesan: 0 | 1 | 2 | 3 | 4;
    gaoji: readonly (0 | 1 | 2 | 3 | 4 | 5 | 6)[];
}
export interface BdjhmjAuthoritativeSnapshot { readonly roomId: number; readonly gameCode: 'bdjhmj'; readonly stateVersion: number; readonly createRules: Readonly<BdjhmjRuleSelections>; readonly [field: string]: unknown; }
/** Intent-only adapter: tile legality, horse/flower rules, scoring and settlement remain server authoritative. */
export const BDJHMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('bdjhmj')!;export const BDJHMJ_ROUTE='mahjong.bdjhmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class BdjhmjGameplayAdapter extends MahjongStandardDirectAdapter<BdjhmjAuthoritativeSnapshot>{constructor(wire:BdjhmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,BDJHMJ_REGION_BINDING);}}
