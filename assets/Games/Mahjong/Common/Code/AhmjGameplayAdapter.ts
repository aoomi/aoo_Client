import{MahjongStandardDirectAdapter}from'./MahjongLifecycleFamilyAdapters';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface AhmjTransport { request<T>(message: string, payload: unknown): Promise<T>; on(message: string, handler: (payload: unknown) => void): () => void; }
export type AhmjOptionalRule = 'DAI_WANG_YING' | 'GANG_SHANG_PAO_DA_HU' | 'NOT_JIE_PAO_SAN_WANG' | 'BI_SAI_FEN_BU_DI_YU_LING' | 'TAKE_LOSE';
export interface AhmjRuleSelections { zhuaniaomoshi: 0|1; niaoshu: 0|1|2|3; gangpai: 0|1; wangshu: 0|1; daniao: 0|1; kexuanwanfa: readonly AhmjOptionalRule[]; }
/** Jing derivation, birds, legal windows, hidden tiles and settlement are server-owned. */
export interface AhmjAuthoritativeSnapshot { readonly roomId:number; readonly gameCode:'ahmj'; readonly stateVersion:number; readonly zhuaniaomoshi:AhmjRuleSelections['zhuaniaomoshi']; readonly niaoshu:AhmjRuleSelections['niaoshu']; readonly gangpai:AhmjRuleSelections['gangpai']; readonly wangshu:AhmjRuleSelections['wangshu']; readonly daniao:AhmjRuleSelections['daniao']; readonly kexuanwanfa:readonly AhmjOptionalRule[]; readonly jingIndicator:number; readonly jingTiles:readonly number[]; readonly birdDraws:number; readonly gangFlipCount:number; readonly [field:string]:unknown; }
export const AHMJ_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('ahmj')!;export const AHMJ_ROUTE='mahjong.ahmj.dispatch';
/** Compatibility factory; lifecycle, route and stale-snapshot handling are family-owned. */
export class AhmjGameplayAdapter extends MahjongStandardDirectAdapter<AhmjAuthoritativeSnapshot>{constructor(wire:AhmjTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,AHMJ_REGION_BINDING);}}
