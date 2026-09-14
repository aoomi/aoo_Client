import{PokerLifecycleFamilyAdapter}from'./PokerLifecycleFamilyAdapter';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface HbpdkTransport {
    request<T>(message: string, payload: unknown): Promise<T>;
    on(message: string, handler: (payload: unknown) => void): () => void;
}

/** Exact immutable selections consumed by the native HBPDK provider. */
export interface HbpdkRuleSelections {
    playerNum: 2 | 3;
    cardNum: 0 | 1 | 2;
    xianchu: 0 | 1 | 2 | 3;
    kexuanwanfa: readonly (4 | 11 | 13)[];
    zhadansuanfa: 0 | 1 | 2;
    zhadanfenshu: 0 | 1;
}

/** Viewer-filtered authority state. Hidden opponents' cards remain opaque. */
export interface HbpdkAuthoritativeSnapshot {
    readonly roomId: number;
    readonly family: 'poker-pao-de-kuai';
    readonly stateVersion: number;
    readonly stockCount: number;
    readonly showRemainingCardCount: boolean;
    readonly [field: string]: unknown;
}

interface HbpdkDispatchResponse {
    readonly payload: unknown;
    readonly stateVersion: number;
    readonly action: string;
}
export const HBPDK_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('hbpdk')!;export const HBPDK_ROUTE='poker.hbpdk.dispatch';
/** Compatibility factory; lifecycle and stale-snapshot handling are family-owned. */
export class HbpdkGameplayAdapter extends PokerLifecycleFamilyAdapter{constructor(wire:HbpdkTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,HBPDK_REGION_BINDING);}}

