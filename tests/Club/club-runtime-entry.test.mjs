import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '../../assets');
const read = (relative) => fs.readFileSync(path.join(assets, relative), 'utf8');
const expectAll = (source, tokens, label) => {
    for (const token of tokens) assert.ok(source.includes(token), `${label}: missing ${token}`);
};

const authorityDirectory = path.join(assets, 'Club/Code/Runtime');
const authoritySources = fs.existsSync(authorityDirectory)
    ? fs.readdirSync(authorityDirectory).filter((name) => name.endsWith('Controller.ts')).sort()
    : [];
assert.deepEqual(authoritySources, [
    'ClubRoomFeeController.ts',
    'LegacyClubCentController.ts',
    'LegacyClubForbidController.ts',
    'LegacyClubMainController.ts',
    'LegacyClubManagementController.ts',
    'LegacyClubMemberController.ts',
    'LegacyClubMessageController.ts',
    'LegacyClubPlayerRecordController.ts',
    'LegacyClubPromotionController.ts',
    'LegacyClubRecordListController.ts',
    'LegacyClubRecordUserController.ts',
    'LegacyClubRecordUserDayController.ts',
    'LegacyClubReportController.ts',
    'LegacyClubRoomManagementController.ts',
    'LegacyJoinClubController.ts',
    'LegacyJoinUnionController.ts',
    'LegacyRecordAllResultController.ts',
    'LegacyUnionClubReportController.ts',
    'LegacyUnionClubUserListController.ts',
    'LegacyUnionCreateController.ts',
    'LegacyUnionInfoPopupController.ts',
    'LegacyUnionInviteController.ts',
    'LegacyUnionManagerController.ts',
    'LegacyUnionZhongzhiManagerController.ts',
    'LegacyUnionZhongzhiRankController.ts',
], 'Club must own exactly the current controller set');
assert.ok(!fs.existsSync(path.join(authorityDirectory, 'LegacyClubCreateRoomController.ts')),
    'retired Club room-create controller must not return beside the unified Hall flow');
const formerCommonDirectory = path.join(assets, 'Common/Code/Runtime/CompatibilityApp/club');
const commonBusinessSources = fs.existsSync(formerCommonDirectory)
    ? fs.readdirSync(formerCommonDirectory).filter((name) => name.endsWith('.ts'))
    : [];
assert.deepEqual(commonBusinessSources, [], 'Common must not retain Club business implementation');
for (const sourceName of authoritySources) {
    const source = read(`Club/Code/Runtime/${sourceName}`);
    assert.doesNotMatch(source, /Lobby\/Code|CompatibilityApp\/club/,
        `${sourceName} must not create a Club/Lobby or Common/Club cycle`);
}

const lobby = read('Lobby/Code/LobbyScreenController.ts');
expectAll(lobby, [
    "./ClubList/LobbyClubEntryController",
    'new LobbyClubEntryController(',
    'this.clubEntry.install()',
], 'production entry');

const entry = read('Lobby/Code/ClubList/LobbyClubEntryController.ts');
expectAll(entry, [
    "forms.register('UILobbyClubList'",
    "form.find('CreatecCub')",
    "CreatecCub/Create/Found/EditBox",
    "Popup/Tag/Close",
    "createPanel.getChildByPath('Create/Confirm')",
    'new LegacyJoinClubController(',
    "client.request<ClubDetail>('club.CClubCreate'",
    'this.top.setDiamond(balance)',
    "'club.CClubRoomConfigItemList'",
    "forms.show('UIMessage_Drift'",
], 'create/join/entry feedback');
assert.doesNotMatch(entry, /forms\.register\('ui\/club\/UIClubCreate'/,
    'create-club popup must use LobbyClubList/CreatecCub instead of the retired standalone form');
const lobbyList = read('Lobby/Code/ClubList/LobbyClubListController.ts');
expectAll(lobbyList, ['Body/List/View/Content', 'Body/Actions/Create', 'Body/Actions/Join'], 'lobby club-list prefab contract');
assert.doesNotMatch(entry, /getDiamond\(\)\s*<\s*100/, 'client must not pre-block club creation by local diamond balance');
assert.doesNotMatch(entry, /钻石不足100无法创建亲友圈/, 'server CRYSTAL debit authority must own insufficient-balance feedback');

const formManager = read('Common/Code/Runtime/ui/LegacyFormManager.ts');
expectAll(formManager, [
    "{ bundle: 'club', asset: 'Prefab/' + canonicalName }",
    'loadBundleWithDependencies(candidate.bundle)',
], 'club native prefab root and dependency resolution');
const clubPrefabMeta = JSON.parse(read('Club/Prefab.meta'));
assert.notEqual(clubPrefabMeta.userData?.isBundle, true, 'Club/Prefab must remain in main instead of publishing a Bundle');
assert.equal(clubPrefabMeta.userData?.bundleName, undefined, 'Club/Prefab must not retain a Bundle name');
const clubAtlasMeta = JSON.parse(read('Club/Atlas.meta'));
assert.notEqual(clubAtlasMeta.userData?.isBundle, true, 'Club/Atlas must remain in main instead of publishing a Bundle');
assert.equal(clubAtlasMeta.userData?.bundleName, undefined, 'Club/Atlas must not retain a Bundle name');

for (const gatewayPath of ['Common/Code/Runtime/role/LegacyRoleGateway.ts']) {
    const gateway = read(gatewayPath);
    expectAll(gateway, [
        'const diamond = this.numberValue(packet.diamond, packet.diamondCount, packet.crystal);',
        'const legacyRoomCard = this.numberValue(packet.roomCard, packet.roomCardCount, packet.gold);',
        'roomCard: diamond > 0 ? diamond : legacyRoomCard',
    ], `${gatewayPath} role currency compatibility`);
}

const join = read('Club/Code/Runtime/LegacyJoinClubController.ts');
expectAll(join, ["forms.register('ui/club/UIJoinClub'", "'club.CClubJoin'", "'加入失败,当前俱乐部已满'"], 'join');

const main = read('Club/Code/Runtime/LegacyClubMainController.ts');
expectAll(main, [
    "forms.show('ui/club/ClubMembers'",
    "show('top/right_btn/btn_fenxiang', 'ui/club/UIYaoQing')",
    "if (path === 'ui/club/UIUnionNone') this.bindUnionNone(form);",
    "forms.show('ui/club/UIUnionCreate', {",
    "clubId: this.clubId()",
    "onCreated: async",
    "forms.show('ui/club/UIJoinUnion', this.clubId())",
    "'ui/club/ClubRooms'",
    "forms.show('ui/club/ClubMsg'",
    "forms.show('ui/club/ClubManage'",
    "show('bottom/btn_ksjr', 'ui/club/UIQuickJoinRoom')",
    "this.openClubRecord()",
    "mainNode.emit('legacy-open-records'",
    "'SClub_RoomStatusChange'",
    "'SClub_RoomPlayerChange'",
    "'club.CClubRoomConfigItemList'",
    "'room.CBaseExitRoom'",
    "'club.CClubFindPIDInfo'",
    "'club.CClubFindPIDAdd'",
    "'legacy-club-rooms-refreshed'",
], 'club navigation, templates, tables, records and room exit');
assert.doesNotMatch(main, /openClubRecord\(\): void \{[^}]*UIClubRecord(?:List|UserDay)/,
    'club record buttons must open the shared Records module prefab');

const member = read('Club/Code/Runtime/LegacyClubMemberController.ts');
expectAll(member, [
    "'club.CClubSetMinister'",
    "'club.CClubSetPromotionMinister'",
    "'club.CClubChangePlayerStatus'",
    "'club.CClubKickOutNeedConfirm'",
    "'成员状态修改失败'",
], 'member permissions and feedback');

const management = read('Club/Code/Runtime/LegacyClubManagementController.ts');
expectAll(management, [
    "'club.CClubChangePlayerStatus'",
    "'club.CClubClose'",
], 'leave and dissolve club');

const unionManagement = read('Club/Code/Runtime/LegacyUnionManagerController.ts');
expectAll(unionManagement, [
    "'union.CUnionDissolve'",
    "'联盟解散失败'",
], 'dissolve union');

const records = read('Club/Code/Runtime/LegacyClubRecordListController.ts');
expectAll(records, ["'club.CClubGetRecord'", "'club.CClubRoomIdOperation'", "'战绩加载失败，请稍后重试'"], 'records');

console.log('club production-entry structural interaction checks passed');
