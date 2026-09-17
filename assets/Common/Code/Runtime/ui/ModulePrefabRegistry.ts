export interface ModulePrefabRoute {
    readonly bundle: string;
    readonly asset: string;
}

const MODULE_PREFAB_BY_FORM = Object.freeze<Record<string, ModulePrefabRoute>>({
    // Lobby/Prefab is no longer an independent Bundle. Both retained lobby
    // prefabs resolve from the parent lobby Bundle under its physical path.
    UILobbyMain: { bundle: 'lobby', asset: 'Prefab/LobbyMain' },
    UILobbyClubList: { bundle: 'lobby', asset: 'Prefab/ClubList' },
    UIJoinClub: { bundle: 'common', asset: 'Prefab/Numpad' },
    UIJoinUnion: { bundle: 'common', asset: 'Prefab/Numpad' },
    UIReplayCode: { bundle: 'common', asset: 'Prefab/Numpad' },
    UICreateRoom: { bundle: 'createroom-ui', asset: 'Prefab/CreateRoom' },
    UILobbySettings: { bundle: 'common', asset: 'Prefab/SettingsPanel' },
    UILobbyCheckIn: { bundle: 'activity-ui', asset: 'Prefab/CheckIn' },
    UILobbyDraw: { bundle: 'activity-ui', asset: 'Prefab/Draw' },
    UILobbyDrawHistory: { bundle: 'activity-ui', asset: 'Prefab/DrawHistory' },
    UILobbyDrawResult: { bundle: 'activity-ui', asset: 'Prefab/DrawResult' },
    UILobbyTasks: { bundle: 'activity-ui', asset: 'Prefab/Tasks' },
    UILobbyDownload: { bundle: 'download-ui', asset: 'Prefab/Download' },
    UILobbyProfile: { bundle: 'profile-ui', asset: 'Prefab/Profile' },
    UILobbyPhoneBind: { bundle: 'profile-ui', asset: 'Prefab/PhoneBind' },
    UILobbyRealName: { bundle: 'profile-ui', asset: 'Prefab/RealName' },
    UILobbyRemark: { bundle: 'profile-ui', asset: 'Prefab/Remark' },
    UILobbyLeaderboard: { bundle: 'ranking-ui', asset: 'Prefab/Leaderboard' },
    UILobbyRecords: { bundle: 'records-ui', asset: 'Prefab/Records' },
    UILobbyRecordItem: { bundle: 'records-ui', asset: 'Prefab/RecordItem' },
    UILobbyUserRecord: { bundle: 'records-ui', asset: 'Prefab/UserRecord' },
    UILobbyMatchRecord: { bundle: 'records-ui', asset: 'Prefab/MatchRecord' },
    UILobbyGift: { bundle: 'gift-room-card-ui', asset: 'Prefab/GiftRoomCard' },
    UILobbyInviteRewards: { bundle: 'rewards-ui', asset: 'Prefab/InviteRewards' },
    UILobbyInviteTask: { bundle: 'rewards-ui', asset: 'Prefab/InviteTask' },
    // Social is physically nested under the activity-ui bundle root. Creator
    // emits an empty config for the nested social-ui declaration, while the
    // actual prefab paths live in activity-ui as Social/Prefab/*.
    UILobbyInvite: { bundle: 'activity-ui', asset: 'Social/Prefab/Invite' },
    UILobbyPromoBind: { bundle: 'activity-ui', asset: 'Social/Prefab/PromoBind' },
    UILobbyShare: { bundle: 'activity-ui', asset: 'Social/Prefab/Share' },
    UILobbyShareImage: { bundle: 'activity-ui', asset: 'Social/Prefab/ShareImage' },
    UILobbyNotice: { bundle: 'activity-ui', asset: 'Social/Prefab/Notice' },
    UILobbyRoomCopy: { bundle: 'activity-ui', asset: 'Social/Prefab/RoomCopy' },
    UILobbyFeedback: { bundle: 'support-ui', asset: 'Prefab/Feedback' },
    UILobbyService: { bundle: 'support-ui', asset: 'Prefab/Service' },
    UIServeice: { bundle: 'support-ui', asset: 'Prefab/Service' },
    UILobbyPractice: { bundle: 'tournament-ui', asset: 'Prefab/Practice' },
    UITop: { bundle: 'navigation-ui', asset: 'Prefab/ModalTopBar' },
    UIGameHelp: { bundle: 'help-ui', asset: 'Prefab/GameHelp' },
    UIStore: { bundle: 'store-ui', asset: 'Prefab/Store' },
});

export function resolveModulePrefabAsset(formPath: string): ModulePrefabRoute | null {
    const formName = formPath.slice(formPath.lastIndexOf('/') + 1);
    return MODULE_PREFAB_BY_FORM[formName] ?? null;
}

/** Refresh warmup uses the same registry as runtime resolution. */
export function listModulePrefabForms(): readonly string[] {
    return Object.keys(MODULE_PREFAB_BY_FORM);
}
