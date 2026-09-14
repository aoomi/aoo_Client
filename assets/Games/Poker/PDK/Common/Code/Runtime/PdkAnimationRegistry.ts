export const PDK_ANIMATION_BUNDLE = 'paodekuai-common';

export type PdkAnimationFolderKey =
    | 'Bomb' | 'ConsecutivePairs' | 'TripleWithoutAttachment'
    | 'TripleWithSingle' | 'TripleWithTwo' | 'TripleWithPair'
    | 'FourWithSingle' | 'FourWithTwo' | 'FourWithPair' | 'FourWithThree'
    | 'Straight' | 'Airplane' | 'ConsecutiveAirplane' | 'Shutout';

export interface PdkAnimationDefinition {
    readonly mountPath: string;
    readonly assetPath: string;
    readonly animationName: string;
    readonly sideAnimationName?: string;
    readonly aliases: readonly string[];
}

// Common card-pattern effects have one authoritative source under
// PDK/Common/Spine. A region may replace presentation in its own boundary, but
// must not copy or shadow this table for rules shared by every PDK variant.
const DEFINITIONS: Readonly<Record<PdkAnimationFolderKey, PdkAnimationDefinition>> = Object.freeze({
    Bomb: { mountPath: 'Boom_Ani', assetPath: 'Spine/zhadan/zhadan', animationName: 'lspdk_zd', aliases: ['Bomb', 'zhadan'] },
    ConsecutivePairs: { mountPath: 'Liandui_Spine', assetPath: 'Spine/liandui/ddz_game_paixing_ld_ani', animationName: 'ddz_paixing_ld_ani', sideAnimationName: 'ddz_paixing_ld2_ani', aliases: ['ConsecutivePairs', 'liandui'] },
    TripleWithoutAttachment: { mountPath: 'Sandaiyi_Spine', assetPath: 'Spine/sanbudai/sanbudai', animationName: 'animation', aliases: ['TripleWithoutAttachment', 'sanbudai'] },
    TripleWithSingle: { mountPath: 'Sandaiyi_Spine', assetPath: 'Spine/sandaiyi/sandaiyi', animationName: 'animation', aliases: ['TripleWithSingle', 'sandaiyi'] },
    TripleWithTwo: { mountPath: 'Sandaier', assetPath: 'Spine/sandaier/sandaier', animationName: 'animation', aliases: ['TripleWithTwo', 'sandaier'] },
    TripleWithPair: { mountPath: 'Sandaier', assetPath: 'Spine/sandaiyidui/sidaidui', animationName: 'animation', aliases: ['TripleWithPair', 'sandaiyidui'] },
    FourWithSingle: { mountPath: 'Sidaiyi', assetPath: 'Spine/sidaiyi/sidaiyi', animationName: 'animation', aliases: ['FourWithSingle', 'sidaiyi'] },
    FourWithTwo: { mountPath: 'Sidaier', assetPath: 'Spine/sidaier/sidaiyi', animationName: 'animation', aliases: ['FourWithTwo', 'sidaier'] },
    FourWithPair: { mountPath: 'Sidaier', assetPath: 'Spine/sidaiyidui/sidaidui', animationName: 'animation', aliases: ['FourWithPair', 'sidaiyidui'] },
    FourWithThree: { mountPath: 'Sidaisan', assetPath: 'Spine/sidaisan/sidaisan', animationName: 'animation', aliases: ['FourWithThree', 'sidaisan'] },
    Straight: { mountPath: 'Shunzi', assetPath: 'Spine/shunzi/ddz_game_paixing_sz_ani', animationName: 'ddz_paixing_sz_ani', sideAnimationName: 'ddz_paixing_sz2_ani', aliases: ['Straight', 'shunzi'] },
    Airplane: { mountPath: 'Plane_Ani', assetPath: 'Spine/feiji/ddz_game_paixing_fjfeiji_ani', animationName: 'ddz_paixing_fjfeiji_ani', sideAnimationName: 'ddz_paixing_fjfeiji2_ani', aliases: ['Airplane', 'feiji'] },
    ConsecutiveAirplane: { mountPath: 'Plane_Ani', assetPath: 'Spine/sanfeiji/ddz_game_paixing_cjfjfeiji_ani', animationName: 'ddz_paixing_fjfeiji_ani', sideAnimationName: 'ddz_paixing_fjfeiji2_ani', aliases: ['ConsecutiveAirplane', 'sanfeiji'] },
    Shutout: { mountPath: 'Shut_Dow_Ani', assetPath: 'Spine/guanmen/guanmen', animationName: 'guanmen', aliases: ['Shutout', 'guanmen'] },
});

const ALIAS_TO_KEY = new Map<string, PdkAnimationFolderKey>();
for (const [key, definition] of Object.entries(DEFINITIONS) as Array<[PdkAnimationFolderKey, PdkAnimationDefinition]>) {
    ALIAS_TO_KEY.set(normalize(key), key);
    for (const alias of definition.aliases) ALIAS_TO_KEY.set(normalize(alias), key);
}

// Operation numbers are the existing CommonPdkGameLogic protocol contract.
const OP_CARD_TYPE_TO_KEY: Readonly<Record<number, PdkAnimationFolderKey>> = Object.freeze({
    4: 'Straight', 5: 'TripleWithoutAttachment', 6: 'TripleWithSingle', 7: 'TripleWithTwo',
    8: 'FourWithSingle', 9: 'FourWithTwo', 10: 'FourWithThree', 11: 'Bomb',
    12: 'Airplane', 13: 'ConsecutiveAirplane', 14: 'ConsecutivePairs', 15: 'TripleWithPair',
    16: 'Airplane', 17: 'Airplane', 18: 'Airplane', 19: 'ConsecutiveAirplane', 20: 'FourWithPair',
});

function normalize(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function resolvePdkAnimationFolderKey(value: string): PdkAnimationFolderKey {
    const key = ALIAS_TO_KEY.get(normalize(value));
    if (!key) throw new Error(`未登记的跑得快动画目录键：${value || '<empty>'}`);
    return key;
}

export function pdkAnimationDefinition(folderKey: PdkAnimationFolderKey): PdkAnimationDefinition {
    return DEFINITIONS[folderKey];
}

export function pdkAnimationFolderKeys(): readonly PdkAnimationFolderKey[] {
    return Object.keys(DEFINITIONS) as PdkAnimationFolderKey[];
}

export function pdkAnimationForOpCardType(opCardType: number): PdkAnimationFolderKey | null {
    return OP_CARD_TYPE_TO_KEY[opCardType] ?? null;
}
