/**
 * Single registry for game-neutral room UI that has more than one visual skin.
 *
 * The logical form name stays stable while the selected prefab can preserve a
 * game's authored layout, event wiring and atlas references.  This prevents
 * game bundles from owning duplicate infrastructure such as chat, settings,
 * waiting, GPS and room-copy windows.
 */
// Game-neutral room popups live under the single Games/Common bundle. Keeping
// Prefab as an ordinary directory prevents Preview and release builds from
// disagreeing about whether a nested bundle is available.
export const COMMON_PREFAB_BUNDLE = 'games-common';
export const COMMON_ASSET_BUNDLE = 'common';
export const NUMPAD_ASSET = 'Numpad';
export const COMMON_HEAD_ASSET = 'Prefab/CommonHead';

export interface CommonPrefabCandidate {
    readonly bundle: string;
    readonly asset: string;
}

const COMMON_CLUB_FORM_ASSETS = Object.freeze<Record<string, CommonPrefabCandidate>>({
    CommonRoom: { bundle: COMMON_PREFAB_BUNDLE, asset: 'Prefab/CommonRoom' },
    // The historic message variants are logical presentation keys. They now all
    // resolve to the one retained Message prefab instead of missing subtemplates.
    UIMessageGps: { bundle: COMMON_ASSET_BUNDLE, asset: 'Prefab/Message' },
    UIMessageJoin: { bundle: COMMON_ASSET_BUNDLE, asset: 'Prefab/Message' },
    UIMessageLostConnect: { bundle: COMMON_ASSET_BUNDLE, asset: 'Prefab/Message' },
    UIMessageTip: { bundle: COMMON_ASSET_BUNDLE, asset: 'Prefab/Message' },
    UIMessageUpdate: { bundle: COMMON_ASSET_BUNDLE, asset: 'Prefab/Message' },
    UIMessage: { bundle: COMMON_ASSET_BUNDLE, asset: 'Prefab/Message' },
    UIQuickJoinRoom: { bundle: COMMON_PREFAB_BUNDLE, asset: 'Prefab/QuickJoinRoom' },
    // UIMessage_Drift is a stable protocol key; its physical Prefab follows Msg naming.
    UIMessage_Drift: { bundle: COMMON_ASSET_BUNDLE, asset: 'Prefab/MsgDrift' },
    // UIWaitForm is the stable loading-form key; the restored root asset is WaitNet.
    UIWaitForm: { bundle: COMMON_ASSET_BUNDLE, asset: 'Prefab/WaitNet' },
    UIWaitNet: { bundle: COMMON_ASSET_BUNDLE, asset: 'Prefab/WaitNet' },
    // 解散投票是所有房间共享的弹窗；业务层只能使用逻辑键 room/DissolveRoom，
    // 不能回退到任何玩法私有的 DissolveRequest 资源。
    DissolveRoom: { bundle: COMMON_PREFAB_BUNDLE, asset: 'Prefab/DissolveRoom' },
    AutoPlay: { bundle: COMMON_PREFAB_BUNDLE, asset: 'Prefab/AutoPlay' },
    ChatPanel: { bundle: COMMON_PREFAB_BUNDLE, asset: 'Prefab/ChatPanel' },
    MagicExpressionPanel: { bundle: COMMON_PREFAB_BUNDLE, asset: 'Prefab/MagicPanel' },
    VoiceRecordingPanel: { bundle: COMMON_PREFAB_BUNDLE, asset: 'Prefab/VoiceRecordingPanel' },
    SettingsPanel: { bundle: COMMON_ASSET_BUNDLE, asset: 'Prefab/SettingsPanel' },
});

export function resolveCommonPrefabAsset(formPath: string): CommonPrefabCandidate | null {
    const formName = formPath.slice(formPath.lastIndexOf('/') + 1);
    return COMMON_CLUB_FORM_ASSETS[formName] ?? null;
}

export function listCommonPrefabForms(): readonly string[] {
    return Object.keys(COMMON_CLUB_FORM_ASSETS);
}

/**
 * 数字键盘是可复用控件资源，不属于任一业务弹窗；调用方只拿逻辑键，
 * 由统一加载器解析到 Common Bundle，后续用户调整 Numpad 内部结构无需改业务路径。
 */
export function resolveCommonNumpadAsset(assetKey: string): string | null {
    return assetKey === NUMPAD_ASSET ? `Prefab/${NUMPAD_ASSET}` : null;
}
