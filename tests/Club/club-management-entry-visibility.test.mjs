import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(
    new URL('../../assets/Club/Code/Runtime/LegacyClubMainController.ts', import.meta.url),
    'utf8',
);
const server = fs.readFileSync(
    new URL('../../../Server/server/Club/src/main/java/com/aoo/bcg/club/ClubDispatchService.java', import.meta.url),
    'utf8',
);

assert.match(main, /private canOpenUnionEntry\(\): boolean \{[\s\S]*return this\.isClubOwner\(\) \|\| \(unionId > 0 && \(allianceRole === 2 \|\| allianceRole === 3\)\);/,
    'alliance entry must only be available to the alliance owner or alliance administrator');
assert.match(main, /private canManageRooms\(\): boolean \{[\s\S]*unionId <= 0\) return this\.clubMinister\(\) > 0;[\s\S]*this\.isClubOwner\(\) \|\| allianceRole === 2 \|\| allianceRole === 3;/,
    'ordinary club management must retain owner/admin access while alliance management uses alliance roles');
assert.match(main, /this\.active\(form, 'Btn_Event', this\.canOpenUnionEntry\(\)\);/);
assert.match(main, /this\.active\(form, 'Btn_Room', canManageRooms\);/);
assert.match(main, /this\.active\(form, 'Btn_Promoter', this\.canOpenCaptainList\(\)\);/);
assert.match(main, /this\.active\(form, 'Btn_BanTable', this\.canManageAlliance\(\)\);/);
assert.doesNotMatch(main, /Btn_Invite|Btn_RoomManage/,
    'ClubMain 已删除的邀请和更多菜单房间管理节点不得保留代码引用');
assert.match(main, /this\.club = \{ \.\.\.\(this\.club \?\? \{\}\), \.\.\.detail, id: clubId \};\s*this\.applyClubModeVisibility\(this\.activeForm\);/,
    'authoritative club role refresh must immediately recompute management visibility');
assert.match(main, /private openRoomManagement\(\): void \{\s*if \(!this\.canManageRooms\(\)\) return;/,
    'hidden room-management routes must also reject stale clicks');
assert.match(main, /private isCaptain\(\): boolean \{[\s\S]*isPromotionManage[\s\S]*levelPromotion/);
assert.match(main, /private isClubOwner\(\): boolean \{\s*return this\.clubMinister\(\) === 2;/,
    'the unchanged club owner must remain the alliance owner after alliance creation');
assert.match(main, /private clubMinister\(\): number \{\s*return Number\(this\.club\?\.minister \?\? this\.club\?\.myisminister \?\? 0\);/);
assert.match(main, /this\.active\(form, 'Btn_Member', minister !== 0 \|\| isCaptain\);/);
assert.match(main, /this\.active\(form, 'Btn_Wechat', minister !== 0\);/);
assert.match(main, /this\.active\(form, 'Btn_Msg', minister !== 0\);/);
assert.match(main, /this\.active\(form, 'Btn_Skin', this\.isClubOwnerOrAllianceOwner\(\)\);/,
    'club/alliance owner must see the skin entrance together with the other owner controls');
assert.match(server, /out\.put\("isPromotionManage", extra\(state, actor\)\.promotionManager\(\)\);/);
assert.match(server, /out\.put\("levelPromotion", extra\(state, actor\)\.promotionManager\(\) \? 1 : 0\);/,
    'captain visibility must be driven by the authoritative member identity');
assert.doesNotMatch(server, /out\.put\("levelPromotion", 1\);/,
    'ordinary members must not be reported as captains');

console.log('club management entry visibility passed');
