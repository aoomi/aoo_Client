import { assetManager, Prefab } from 'cc';

const commonPopupNames = new Set<string>([
    'GameHzmjCommonUiHzmjUIChat',
    'GameHzmjCommonUiHzmjUISetting02',
    'GameHzmjCommonUiHzmjUIUserInfo',
    'GameHzmjCommonUiHzmjUIGPSLoation',
    'GameHzmjBaseHzmjUIInvitation',
    'GameHzmjCommonUiHzmjUIRoomCopy',
    'GameHzmjCommonUiHzmjUIWaitForm',
    'GameHzmjCommonEffectWaitFormWaitForm',
    'GameHzmjCommonEffectWaitNetWaitNet',
    'GameHzmjCommonUiHzmjUIAutoPlay',
    'GameHzmjCommonUiHzmjUIAudio',
    'GameHzmjCommonUiHzmjUINoticeBar',
    'GameHzmjCommonUiHzmjUIMessage',
    'GameHzmjCommonUiHzmjUIMessage-001',
    'GameHzmjCommonUiHzmjUIMessage02',
    'GameHzmjCommonUiHzmjUIMessage03',
    'GameHzmjCommonUiHzmjUIMessageDrift',
    'GameHzmjCommonUiHzmjUIMessageJoin',
    'GameHzmjCommonUiHzmjGiftPrefab',
    'GameHzmjCommonAnimationGiftJidanPrefab',
    'GameHzmjCommonAnimationGiftPengbeiPrefab',
    'GameHzmjCommonAnimationGiftPoshuiPrefab',
    'GameHzmjCommonAnimationGiftXianhuaPrefab',
    'GameHzmjCommonAnimationGiftXianwenPrefab',
    'GameHzmjCommonAnimationGiftZhadanPrefab',
    'GameHzmjCommonAnimationGiftZhuajiPrefab',
]);

/** Loads non-settlement HZMJ prefabs from their authoritative migrated bundle. */
export function loadHzmjPrefab(prefabName: string): Promise<Prefab> {
    const bundleName = commonPopupNames.has(prefabName) ? 'games-common-prefab' : 'mahjong-common-room-2d';
    return new Promise((resolve, reject) => {
        assetManager.loadBundle(bundleName, (bundleError, bundle) => {
            if (bundleError || !bundle) {
                reject(bundleError ?? new Error(`预制体包不可用：${bundleName}`));
                return;
            }
            bundle.load(prefabName, Prefab, (error, prefab) => error ? reject(error) : resolve(prefab));
        });
    });
}
