import{PokerLifecycleFamilyAdapter}from'./PokerLifecycleFamilyAdapter';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface AypdkTransport {
    request<T>(message: string, payload: unknown): Promise<T>;
    on(message: string, handler: (payload: unknown) => void): () => void;
}

/** Exact game-private fields from old CAYPDK_CreateRoom. */
export interface AypdkRuleSelections {
    chupai: 0 | 1 | 2;
    heitaosanbichu: 0 | 1;
    zhadan: 0 | 1 | 2;
    daxiaoguan: 0 | 1;
    paixing: readonly (0 | 1 | 2 | 3 | 4 | 5)[];
    teshu: readonly number[];
}

export interface AypdkAuthoritativeSnapshot {
    readonly roomId: number;
    readonly family: 'poker-pao-de-kuai';
    readonly stateVersion: number;
    readonly [field: string]: unknown;
}

interface AypdkDispatchResponse {
    readonly payload: unknown;
    readonly stateVersion: number;
    readonly action: string;
}
export const AYPDK_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('aypdk')!;export const AYPDK_ROUTE='poker.aypdk.dispatch';
/** Compatibility factory; lifecycle and stale-snapshot handling are family-owned. */
export class AypdkGameplayAdapter extends PokerLifecycleFamilyAdapter{constructor(wire:AypdkTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,AYPDK_REGION_BINDING);}}

