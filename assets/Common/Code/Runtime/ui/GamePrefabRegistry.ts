export interface GamePrefabRoute {
    bundle: string;
    asset: string;
}

const GAME_PREFAB_BY_FORM: Record<string, GamePrefabRoute> = {
    // 使用 Creator 资源库中的真实 Bundle 相对路径，禁止引用已移除的迁移目录。
    'pdk/PDK_CommonRoom': { bundle: 'paodekuai-common', asset: 'Prefab/PDK_CommonRoom' },
    // 权威回放复用玩法默认房间，确保桌面、座位和牌面始终与实战一致。
    'pdk/AuthoritativeReplay': { bundle: 'paodekuai-common', asset: 'Prefab/PDK_CommonRoom' },
    'settlement/poker/SmallSettlement': { bundle: 'paodekuai-common', asset: 'Prefab/SmallSettlement' },
    'history/poker/SmallSettlement': { bundle: 'paodekuai-common', asset: 'Prefab/SmallSettlement' },
    'settlement/poker/BigSettlement': { bundle: 'poker-common', asset: 'Prefab/BigSettlement_0' },
    // 所有扑克玩法共用同一套选牌器；玩法只注入权威牌堆和发牌阶段能力。
    'poker/CardSelection': { bundle: 'poker-common', asset: 'Prefab/PokerTest' },
};

/** Registers a catalog-resolved gameplay prefab for a history-only form route. */
export function registerGamePrefabForm(formPath: string, route: GamePrefabRoute): void {
    const path = formPath.trim();
    if (!path.startsWith('history/')) throw new Error(`历史预制体路由无效: ${formPath}`);
    const existing = GAME_PREFAB_BY_FORM[path];
    if (existing && (existing.bundle !== route.bundle || existing.asset !== route.asset)) {
        throw new Error(`历史预制体路由冲突: ${formPath}`);
    }
    GAME_PREFAB_BY_FORM[path] = Object.freeze({ ...route });
}

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
