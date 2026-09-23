import { AssetManager, Prefab } from 'cc';
import { CATALOG_FAMILY_BINDINGS } from '../Catalog/CatalogFamilyBindings';
import { SettlementBundlePreloader, SettlementCardCategory, SettlementKind } from './SettlementBundlePreloader';

export type SettlementType = 'BIG' | 'SMALL' | 'LOOP_BIG';

export interface SettlementTemplateRequest {
    gameId: string;
    playFamily?: string;
    settlementType: SettlementType;
    configuredTemplateId?: string | null;
    playVersion?: string;
    traceId?: string;
}

export interface SettlementTemplateRoute {
    category: SettlementCardCategory;
    kind: SettlementKind;
    bundleName: string;
    templateId: string;
    defaultTemplateId: string;
    isDefault: boolean;
    assetPath?: string;
}

const categoryByGameId = new Map(CATALOG_FAMILY_BINDINGS.map((binding) => {
    const category: SettlementCardCategory | null = binding.family.startsWith('mahjong:') ? 'Mahjong'
        : binding.family.startsWith('poker:') ? 'Poker'
        : binding.family.startsWith('long-card:') ? 'LongCard'
        : binding.family.startsWith('word-card:') ? 'WordCard' : null;
    return [binding.code, category] as const;
}).filter((entry): entry is readonly [string, SettlementCardCategory] => entry[1] !== null));
const familyByGameId = new Map(CATALOG_FAMILY_BINDINGS.map((binding) => [binding.code, binding.family] as const));
const pdkGameCodes = new Set(['cd201', 'nj201', 'ls201']);
const pokerFamilyAlias: Readonly<Record<string, string>> = {
    'pao-de-kuai': 'pdk', 'compare-hand': 'zjh', betting: 'nn', landlord: 'ddz',
    climbing: 'climbing', '510k': '510k', 'generic-card-round': 'generic_card_round', 'trick-taking': 'trick_taking',
};
const pokerPublicSettlementFamilies = new Set(['cd299']);

function kindFor(type: SettlementType): SettlementKind {
    return type === 'SMALL' ? 'SmallSettle' : 'BigSettle';
}

function bundleFor(category: SettlementCardCategory, kind: SettlementKind): string {
    if (category === 'Poker') return 'poker-common';
    return `${category.toLowerCase()}-${kind === 'BigSettle' ? 'big-settle' : 'small-settle'}`;
}

function pokerAssetPath(kind: SettlementKind, templateId: string): string {
    return `Prefab/${kind}/${templateId}`;
}

function categoryForFamily(family: string): SettlementCardCategory | null {
    if (family.startsWith('mahjong:')) return 'Mahjong';
    if (family.startsWith('poker:')) return 'Poker';
    if (family.startsWith('long-card:')) return 'LongCard';
    if (family.startsWith('word-card:')) return 'WordCard';
    return null;
}

/**
 * The only settlement-template selection boundary. Gameplay code must never build
 * settlement bundle names or fallback paths itself.
 */
export class SettlementTemplateResolver {
    public constructor(private readonly bundles = new SettlementBundlePreloader()) {}

    public resolve(request: SettlementTemplateRequest): SettlementTemplateRoute {
        const gameId = request.gameId.trim().toLowerCase();
        const family = this.canonicalFamily(request.playFamily?.trim() || familyByGameId.get(gameId.toUpperCase()) || '');
        const category = categoryByGameId.get(gameId.toUpperCase()) ?? categoryForFamily(family);
        if (!category) throw new Error(`未配置结算牌类: ${request.gameId}`);
        const kind = kindFor(request.settlementType);
        if (request.settlementType === 'LOOP_BIG') {
            if (category !== 'Poker' || family !== 'poker:cd299') {
                throw new Error(`循环大结算仅允许 CD299: ${family || request.gameId}`);
            }
            return this.resolvePokerBig(request, family);
        }
        if (category === 'Poker' && kind === 'SmallSettle') return this.resolvePokerSmall(request, family);
        if (category === 'Poker' && kind === 'BigSettle') return this.resolvePokerBig(request, family);
        const expected = new RegExp(`^${kind}Tpl_(?:0[1-9]|[1-9]\\d+)$`);
        const configured = request.configuredTemplateId?.trim() ?? '';
        const isDefault = configured.length === 0 || !expected.test(configured);
        if (configured.length > 0 && isDefault) this.warn(request, category, kind, configured, '模板标识无效，回退默认模板');
        const defaultTemplateId = `${kind}Tpl_00`;
        return { category, kind, bundleName: bundleFor(category, kind), templateId: isDefault ? defaultTemplateId : configured, defaultTemplateId, isDefault };
    }

    public async load(request: SettlementTemplateRequest): Promise<{ route: SettlementTemplateRoute; prefab: Prefab }> {
        const route = this.resolve(request);
        const bundle = await this.bundles.loadBundle(route.bundleName);
        try {
            return { route, prefab: await this.loadPrefab(bundle, route.assetPath ?? route.templateId) };
        } catch (error) {
            if (route.isDefault) throw new Error(`默认结算模板缺失: ${route.bundleName}/${route.templateId}`, { cause: error });
            this.warn(request, route.category, route.kind, route.templateId, '模板不存在，回退默认模板');
            const fallback = {
                ...route,
                templateId: route.defaultTemplateId,
                isDefault: true,
                assetPath: route.category === 'Poker'
                    ? pokerAssetPath(route.kind, route.defaultTemplateId)
                    : route.assetPath,
            };
            return { route: fallback, prefab: await this.loadPrefab(bundle, fallback.assetPath ?? fallback.templateId) };
        }
    }

    private resolvePokerSmall(request: SettlementTemplateRequest, family: string): SettlementTemplateRoute {
        const key = family.startsWith('poker:') ? family.slice('poker:'.length) : family;
        const alias = pokerFamilyAlias[key];
        const isPdk = alias === 'pdk' || pdkGameCodes.has(request.gameId.trim().toLowerCase());
        const usesPublicSettlement = pokerPublicSettlementFamilies.has(key);
        if (!alias && !isPdk && !usesPublicSettlement) throw new Error(`扑克小结算缺少可识别玩法族: ${family || request.gameId}`);
        const kind: SettlementKind = 'SmallSettle';
        const defaultTemplateId = 'SmallSettlement';
        const bundleName = bundleFor('Poker', kind);
        if (isPdk || usesPublicSettlement) {
            const configured = request.configuredTemplateId?.trim() ?? '';
            // These families share one canonical small-settlement prefab.
            // Historical numeric ids are not native paths in its owner bundle.
            if (configured.length > 0 && configured !== defaultTemplateId) {
                this.warn(request, 'Poker', kind, configured,
                    isPdk ? '跑得快固定使用公共小结算，忽略旧模板标识' : 'CD299 固定使用扑克公共小结算，忽略旧模板标识',
                    'paodekuai-common');
            }
            return {
                category: 'Poker', kind, bundleName: 'paodekuai-common',
                templateId: defaultTemplateId,
                defaultTemplateId, isDefault: true,
                assetPath: 'Prefab/SmallSettlement',
            };
        }
        const configured = request.configuredTemplateId?.trim() ?? '';
        const expected = new RegExp(`^SmallSettleTpl_${alias}_(?:0[1-9]|[1-9]\\d+)$`);
        const isDefault = configured.length === 0 || !expected.test(configured);
        if (configured.length > 0 && isDefault) this.warn(request, 'Poker', kind, configured, '扑克小结算模板与玩法族不匹配，回退同玩法族默认模板');
        return {
            category: 'Poker', kind, bundleName,
            templateId: isDefault ? defaultTemplateId : configured,
            defaultTemplateId, isDefault,
            assetPath: pokerAssetPath(kind, isDefault ? defaultTemplateId : configured),
        };
    }

    private resolvePokerBig(request: SettlementTemplateRequest, family: string): SettlementTemplateRoute {
        const key = family.startsWith('poker:') ? family.slice('poker:'.length) : family;
        const alias = pokerFamilyAlias[key];
        const isPdk = alias === 'pdk' || pdkGameCodes.has(request.gameId.trim().toLowerCase());
        const usesPublicSettlement = pokerPublicSettlementFamilies.has(key);
        if (!alias && !isPdk && !usesPublicSettlement) throw new Error(`扑克大结算缺少可识别玩法族: ${family || request.gameId}`);
        const kind: SettlementKind = 'BigSettle';
        const defaultTemplateId = 'BigSettlement';
        const bundleName = bundleFor('Poker', kind);
        if (isPdk || usesPublicSettlement) {
            const configured = request.configuredTemplateId?.trim() ?? '';
            // These families use the one Poker public final-settlement prefab.
            // Never turn a legacy catalog id into a native form path.
            if (configured.length > 0 && configured !== defaultTemplateId) {
                this.warn(request, 'Poker', kind, configured,
                    isPdk ? '跑得快固定使用扑克公共大结算，忽略旧模板标识' : 'CD299 固定使用扑克公共大结算，忽略旧模板标识',
                    bundleName);
            }
            return {
                category: 'Poker', kind, bundleName,
                templateId: defaultTemplateId,
                defaultTemplateId, isDefault: true,
                assetPath: 'Prefab/BigSettlement_0',
            };
        }
        const configured = request.configuredTemplateId?.trim() ?? '';
        const expected = new RegExp(`^BigSettleTpl_(?:0[1-9]|[1-9]\\d+)$`);
        const isDefault = configured.length === 0 || !expected.test(configured);
        if (configured.length > 0 && isDefault) this.warn(request, 'Poker', kind, configured, '扑克大结算模板标识无效，回退默认模板');
        return {
            category: 'Poker', kind, bundleName,
            templateId: isDefault ? defaultTemplateId : configured,
            defaultTemplateId, isDefault,
            assetPath: pokerAssetPath(kind, isDefault ? defaultTemplateId : configured),
        };
    }

    private canonicalFamily(family: string): string {
        const value = family.trim().toLowerCase();
        if (!value.includes('_')) return value;
        const [category, ...parts] = value.split('_').filter(Boolean);
        return parts.length > 0 ? `${category}:${parts.join('-')}` : category;
    }

    private loadPrefab(bundle: AssetManager.Bundle, templateId: string): Promise<Prefab> {
        return new Promise((resolve, reject) => bundle.load(templateId, Prefab, (error, prefab) => {
            if (error || !prefab) reject(error ?? new Error(`结算模板不可用: ${templateId}`));
            else resolve(prefab);
        }));
    }

    private warn(request: SettlementTemplateRequest, category: SettlementCardCategory, kind: SettlementKind, templateId: string, message: string, bundleName = bundleFor(category, kind)): void {
        console.warn('[SettlementTemplateResolver]', JSON.stringify({
            message, gameId: request.gameId, playFamily: request.playFamily ?? '', bundleName,
            templateId, traceId: request.traceId ?? '', playVersion: request.playVersion ?? '',
        }));
    }
}

export const settlementTemplateResolver = new SettlementTemplateResolver();
