import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const prefab = (name) => JSON.parse(read(`assets/Club/Prefab/${name}`));

function labelState(name, nodeName) {
    const data = prefab(name);
    const node = data.find((item) => item?.__type__ === 'cc.Node' && item._name === nodeName);
    assert.ok(node, `${name} 缺少 ${nodeName}`);
    const label = node._components.map((ref) => data[ref.__id__])
        .find((item) => item?.__type__ === 'cc.Label');
    assert.ok(label, `${name}/${nodeName} 缺少 Label`);
    return label;
}

test('成员、禁止玩法和从属修改的动态文本完整显示', () => {
    for (const [file, node] of [
        ['ClubMembers.prefab', 'id'],
        ['ClubMembers.prefab', 'promoterId'],
        ['ForbidRoomCfg.prefab', 'lb_roomName'],
        ['ClubPromoterSet.prefab', 'lb_user'],
        ['ClubPromoterSet.prefab', 'lb_upname'],
    ]) {
        const label = labelState(file, node);
        assert.equal(label._overflow, 2, `${file}/${node} 必须使用 SHRINK`);
        assert.equal(label._enableWrapText, false, `${file}/${node} 不得换行裁切`);
    }
});

test('成员与队长业务统一使用动态标识显示规则', () => {
    const utility = read('assets/Club/Code/Runtime/ClubDynamicLabel.ts');
    assert.match(utility, /Label\.Overflow\.SHRINK/);
    assert.match(utility, /label\.enableWrapText = false/);
    assert.match(utility, /player\?\.displayId \?\? player\?\.pid/,
        '玩家对外ID必须优先使用displayId，pid只能作为兼容回退');
    const promotion = read('assets/Club/Code/Runtime/LegacyClubPromotionController.ts');
    assert.match(promotion, /lb_upname[^\n]+clubPlayerDisplayId\(this\.context\.player\)/,
        '从属修改必须显示上级推广员的完整displayId');
    for (const controller of [
        'LegacyClubMainController.ts',
        'LegacyClubMemberController.ts',
        'LegacyClubPromotionController.ts',
        'LegacyClubForbidController.ts',
        'LegacyClubReportController.ts',
        'LegacyClubRecordUserController.ts',
        'LegacyClubRecordUserDayController.ts',
        'LegacyClubPlayerRecordController.ts',
        'LegacyClubCentController.ts',
        'LegacyClubRecordListController.ts',
        'LegacyClubRoomManagementController.ts',
        'LegacyUnionClubUserListController.ts',
        'LegacyUnionManagerController.ts',
        'LegacyUnionZhongzhiManagerController.ts',
        'LegacyUnionZhongzhiRankController.ts',
        'ClubBox/ClubBoxController.ts',
    ]) {
        assert.match(read(`assets/Club/Code/Runtime/${controller}`), /setClubDynamicLabel\(/,
            `${controller} 必须接入动态标识显示规则`);
    }
});
