import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const management = readFileSync(new URL('assets/Club/Code/Runtime/LegacyClubManagementController.ts', root), 'utf8');
const unionManagement = readFileSync(new URL('assets/Club/Code/Runtime/LegacyUnionManagerController.ts', root), 'utf8');
const clubMain = readFileSync(new URL('assets/Club/Code/Runtime/LegacyClubMainController.ts', root), 'utf8');
const prefabMap = JSON.parse(readFileSync(new URL('assets/Common/Config/NativeMaps/prefab-path-map.json', root), 'utf8'));

assert.ok(management.includes("forms.show('UIMessage', null, null, '确定解散当前俱乐部吗？')"));
assert.ok(management.includes("client.request('club.CClubClose', { clubId })"));
assert.doesNotMatch(management, /UIClubDissolve/);
assert.equal(prefabMap['ui/club/UIClubDissolve.prefab'], undefined);
assert.ok(unionManagement.includes("forms.show('UIMessage', null, null, '确定解散当前联盟吗？')"));
assert.ok(unionManagement.includes("client.request('union.CUnionDissolve', this.packetBase())"));
assert.match(unionManagement, /await onDissolved\?\.\(\)/,
    '联盟解散成功后必须通知大厅更新联盟路由状态');
assert.doesNotMatch(unionManagement, /UIClubDissolve/);
assert.match(clubMain, /private async openUnionEntry\(\): Promise<void>[\s\S]*refreshCurrentClub\(clubId\)[\s\S]*context\.unionId > 0 \? 'ui\/club\/UIUnionManager' : 'ui\/club\/UIUnionNone'/,
    '点击联盟入口必须先回查权威状态再选择界面');
assert.match(clubMain, /onDissolved: \(\) => this\.handleUnionDissolved\(clubId\)/,
    '联盟管理页必须将解散成功回调连回大厅');
assert.match(clubMain, /Object\.assign\(this\.club, \{ unionId: 0, unionSign: 0, unionName: '', unionPostType: 0 \}\)/,
    '解散成功后必须立即清除本地联盟路由字段');

console.log('club dissolve confirmation flow passed');
