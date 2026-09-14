import { AssetManager, Prefab } from 'cc';
import { CATALOG_FAMILY_BINDINGS } from '../Catalog/CatalogFamilyBindings';
import { SettlementBundlePreloader, SettlementCardCategory, SettlementKind } from './SettlementBundlePreloader';

export type SettlementType = 'BIG' | 'SMALL';

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
const pokerFamilyAlias: Readonly<Record<string, string>> = {
    'pao-de-kuai': 'pdk', 'compare-hand': 'zjh', betting: 'nn', landlord: 'ddz',
    climbing: 'climbing', '510k': '510k', 'generic-card-round': 'generic_card_round', 'trick-taking': 'trick_taking',
};

function kindFor(type: SettlementType): SettlementKind {
    return type === 'BIG' ? 'BigSettle' : 'SmallSettle';
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
        const family = this.canonicalFamily(request.playFamily?.trim() || familyByGameId.get(gameId) || '');
        const category = categoryByGameId.get(gameId) ?? categoryForFamily(family);
        if (!category) throw new Error(`未配置结算牌类: ${request.gameId}`);
        const kind = kindFor(request.settlementType);
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
        if (!alias) throw new Error(`扑克小结算缺少可识别玩法族: ${family || request.gameId}`);
        const kind: SettlementKind = 'SmallSettle';
        const defaultTemplateId = 'SmallSettlement';
        const bundleName = bundleFor('Poker', kind);
        if (alias === 'pdk') {
            const configured = request.configuredTemplateId?.trim() ?? '';
            const isDefault = configured.length === 0 || configured === defaultTemplateId;
            if (isDefault) {
                return {
                    category: 'Poker', kind, bundleName: 'paodekuai-common',
                    templateId: defaultTemplateId,
                    defaultTemplateId, isDefault: true,
                    assetPath: 'Prefab/SmallSettlement',
                };
            }
            return {
                category: 'Poker', kind, bundleName,
                templateId: configured,
                defaultTemplateId, isDefault: false,
                assetPath: pokerAssetPath(kind, configured),
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
        if (!alias) throw new Error(`扑克大结算缺少可识别玩法族: ${family || request.gameId}`);
        const kind: SettlementKind = 'BigSettle';
        const defaultTemplateId = 'BigSettlement';
        const bundleName = bundleFor('Poker', kind);
        if (alias === 'pdk') {
            const configured = request.configuredTemplateId?.trim() ?? '';
            const isDefault = configured.length === 0 || configured === defaultTemplateId || configured === 'FinalSettlement';
            if (configured === 'FinalSettlement') this.warn(request, 'Poker', kind, configured, '旧跑得快大结算别名已迁移到扑克公共默认预制体', bundleName);
            return {
                category: 'Poker', kind, bundleName,
                templateId: isDefault ? defaultTemplateId : configured,
                defaultTemplateId, isDefault,
                assetPath: isDefault ? 'Prefab/BigSettlement_0'
                    : pokerAssetPath(kind, configured),
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
