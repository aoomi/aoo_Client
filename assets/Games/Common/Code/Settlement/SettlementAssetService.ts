import { CATALOG_FAMILY_BINDINGS } from '../Catalog/CatalogFamilyBindings';

/** Current settlement categories. Historical WordCard identifiers normalize to LongCard. */
export type SettlementCardCategory = 'LongCard' | 'Mahjong' | 'Poker';
export type SettlementKind = 'BigSettle' | 'SmallSettle';

const familyByGameCode = new Map(CATALOG_FAMILY_BINDINGS.map((binding) => [binding.code.toLowerCase(), binding.family] as const));
const categoryByGameCode = new Map(CATALOG_FAMILY_BINDINGS.map((binding) => {
    const category = settlementCategoryForFamily(binding.family);
    return [binding.code.toLowerCase(), category] as const;
}).filter((entry): entry is readonly [string, SettlementCardCategory] => entry[1] !== null));
const pokerPublicSettlementFamilies = new Set(['poker:cd299']);

export function canonicalSettlementFamily(value?: string): string {
    const family = value?.trim().toLowerCase() ?? '';
    if (!family || !family.includes('_')) return family;
    const [category, ...parts] = family.split('_').filter(Boolean);
    return parts.length > 0 ? `${category}:${parts.join('-')}` : category;
}

export function settlementFamilyForGame(gameCode: string): string {
    return familyByGameCode.get(gameCode.trim().toLowerCase()) ?? '';
}

export function settlementCategoryForFamily(family?: string): SettlementCardCategory | null {
    const canonical = canonicalSettlementFamily(family);
    if (canonical.startsWith('mahjong:')) return 'Mahjong';
    if (canonical.startsWith('poker:')) return 'Poker';
    if (canonical.startsWith('long-card:')) return 'LongCard';
    if (canonical.startsWith('word-card:')) return 'LongCard';
    return null;
}

export function settlementCategoryForGame(gameCode: string, playFamily?: string): SettlementCardCategory | null {
    const normalized = gameCode.trim().toLowerCase();
    return categoryByGameCode.get(normalized)
        ?? settlementCategoryForFamily(playFamily)
        ?? settlementCategoryForFamily(settlementFamilyForGame(normalized));
}

export function isPdkSettlementGame(gameCode: string, playFamily?: string): boolean {
    const catalogFamily = settlementFamilyForGame(gameCode);
    return catalogFamily === 'poker:pao-de-kuai'
        || canonicalSettlementFamily(playFamily) === 'poker:pao-de-kuai';
}

export function isPokerPublicSettlementGame(gameCode: string, playFamily?: string): boolean {
    const family = settlementFamilyForGame(gameCode) || canonicalSettlementFamily(playFamily);
    return pokerPublicSettlementFamilies.has(family);
}

export function settlementKindForType(type: 'BIG' | 'SMALL' | 'LOOP_BIG'): SettlementKind {
    return type === 'SMALL' ? 'SmallSettle' : 'BigSettle';
}

export function settlementBundleName(category: SettlementCardCategory, kind: SettlementKind): string {
    if (category === 'Poker') return 'poker-common';
    return `${category.toLowerCase()}-${kind === 'BigSettle' ? 'big-settle' : 'small-settle'}`;
}

export function settlementBundleNameForGame(gameCode: string, kind: SettlementKind, playFamily?: string): string | null {
    if (isPdkSettlementGame(gameCode, playFamily) || isPokerPublicSettlementGame(gameCode, playFamily)) {
        return kind === 'SmallSettle' ? 'paodekuai-common' : 'poker-common';
    }
    const category = settlementCategoryForGame(gameCode, playFamily);
    return category ? settlementBundleName(category, kind) : null;
}

export function settlementPreloadBundleNames(gameCode: string, playFamily?: string): readonly string[] {
    const small = settlementBundleNameForGame(gameCode, 'SmallSettle', playFamily);
    const big = settlementBundleNameForGame(gameCode, 'BigSettle', playFamily);
    return [...new Set([small, big].filter((name): name is string => name !== null))];
}
