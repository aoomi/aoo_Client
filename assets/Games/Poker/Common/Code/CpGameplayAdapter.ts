import{PokerLifecycleFamilyAdapter}from'./PokerLifecycleFamilyAdapter';
import{FAMILY_RUNTIME_REGISTRY}from'../../../Common/Code/Catalog/CatalogFamilyBindings';
export interface CpTransport {
    request<T>(message: string, payload: unknown): Promise<T>;
    on(message: string, handler: (payload: unknown) => void): () => void;
}

/** Exact game-private fields from old CCP_CreateRoom. */
export interface CpRuleSelections {
    /** 0 hard-fan; 1 ladder/exponential. */
    moshi: 0 | 1;
    /** Old option index: 0/1/2 => 3/4/5 fan, 3 => uncapped. */
    fanshushangxian: 0 | 1 | 2 | 3;
    /** Old option index: 0/1/2 => base score 1/5/10. */
    difen: 0 | 1 | 2;
}

/** Values from CPRoomEnum.CP_CARD_TYPE. */
export type CpCardType = 2 | 3 | 4 | 5 | 6 | 7;

/** Opaque view: the server alone owns comparison, forced-cover and settlement. */
export interface CpAuthoritativeSnapshot {
    readonly roomId: number;
    readonly gameCode: 'cp';
    readonly stateVersion: number;
    readonly [field: string]: unknown;
}
export const CP_REGION_BINDING=FAMILY_RUNTIME_REGISTRY.resolve('cp')!;export const CP_ROUTE='poker.cp.dispatch';
/** Compatibility factory; lifecycle and stale-snapshot handling are family-owned. */
export class CpGameplayAdapter extends PokerLifecycleFamilyAdapter{constructor(wire:CpTransport,roomId:number,..._regionConfig:unknown[]){super(wire,roomId,CP_REGION_BINDING);}}

