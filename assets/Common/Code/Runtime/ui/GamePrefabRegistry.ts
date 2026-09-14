export interface GamePrefabRoute {
    bundle: string;
    asset: string;
}

const GAME_PREFAB_BY_FORM = Object.freeze<Record<string, GamePrefabRoute>>({
    'pdk/PDK_CommonRoom': { bundle: 'paodekuai-common', asset: 'Prefab/PDK_CommonRoom' },
    // 权威回放复用玩法默认房间，确保桌面、座位和牌面始终与实战一致。
    'pdk/AuthoritativeReplay': { bundle: 'paodekuai-common', asset: 'Prefab/PDK_CommonRoom' },
    'settlement/poker/SmallSettlement': { bundle: 'paodekuai-common', asset: 'Prefab/SmallSettlement' },
    'history/poker/SmallSettlement': { bundle: 'paodekuai-common', asset: 'Prefab/SmallSettlement' },
    'settlement/poker/BigSettlement': { bundle: 'poker-common', asset: 'Prefab/BigSettlement_0' },
});

export function resolveGamePrefabAsset(formPath: string): GamePrefabRoute | null {
    const registered = GAME_PREFAB_BY_FORM[formPath];
    if (registered) return registered;
    const match = /^(?:settlement|history)\/poker\/(SmallSettlement|BigSettlement|SmallSettleTpl_[A-Za-z0-9_]+|BigSettleTpl_[A-Za-z0-9_]+)$/.exec(formPath);
    if (!match) return null;
    const templateId = match[1];
    const kind = templateId.startsWith('Small') ? 'SmallSettle' : 'BigSettle';
    return { bundle: 'poker-common', asset: `Prefab/${kind}/${templateId}` };
}

export function listGamePrefabForms(): readonly string[] {
    return Object.keys(GAME_PREFAB_BY_FORM);
}
