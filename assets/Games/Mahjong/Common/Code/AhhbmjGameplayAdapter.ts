import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface AhhbmjTransport { request<T>(message: string, payload: unknown): Promise<T>; on(message: string, handler: (payload: unknown) => void): () => void; }

/** Exact CAHHBMJ_CreateRoom fields plus inherited live room selections. */
export interface AhhbmjRuleSelections {
    jushu: 0 | 1 | 2; renshu: 2 | 3 | 4; fangfei: 0 | 1 | 2;
    /** 0 坐拉跑, 1 不可点炮, 2 一炮多响, 3 十三幺, 4 带8花, 5 不留牌. */
    kexuanwanfa: readonly (0 | 1 | 2 | 3 | 4 | 5)[];
    /** 0 去万, 1 去字, 2 去风. */ paishu: readonly (0 | 1 | 2)[];
    gangpaisuanfen: 0 | 1;
    /** 七对×2, 杠胡×2, 十三不靠×2, 七星十三不靠×4. */ fanbei: readonly (0 | 1 | 2 | 3)[];
    /** 报胡, 夹子, 缺一. */ jiafan: readonly (0 | 1 | 2)[];
    qiangganghu: 0 | 1; paohufen: 0 | 1; zimofen: 0 | 1;
    fangjian: readonly (0 | 1 | 2)[]; xianShi: 0 | 1 | 2 | 3 | 4; jiesan: 0 | 1 | 2 | 3 | 4;
    gaoji: readonly (0 | 1 | 2 | 3 | 4 | 5 | 6)[];
}
export type AhhbmjPhase = 'WAITING' | 'PIAO_FEN' | 'INIT' | 'PLAYING' | 'FINISHED';
export interface AhhbmjAuthoritativeSnapshot { readonly roomId: number; readonly gameCode: 'ahhbmj'; readonly stateVersion: number; readonly phase: AhhbmjPhase; readonly createRules: Readonly<AhhbmjRuleSelections>; readonly piaoFenChoices: Readonly<Record<string, 0 | 1 | 2 | 3>>; readonly [field: string]: unknown; }

/** Sends intent and renders opaque authority snapshots; legality, rules, scoring and settlement stay server-owned. */
export const AHHBMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('ahhbmj')!;export const AHHBMJ_ROUTE='mahjong.ahhbmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class AhhbmjGameplayAdapter extends MahjongStandardDirectAdapter<AhhbmjAuthoritativeSnapshot>{constructor(wire:AhhbmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,AHHBMJ_REGION_BINDING);}}
