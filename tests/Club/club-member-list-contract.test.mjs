import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root,
    'assets/Club/Code/Runtime/LegacyClubMemberController.ts'), 'utf8');

test('成员列表使用公共无限滚动并移除手动分页', () => {
    assert.match(source, /UnifiedScroll\.ensure\([^;]+UnifiedScrollDirection\.Vertical\)/);
    assert.match(source, /ScrollEvents\.onBottom/);
    assert.match(source, /bottom\/btn_next', false/);
    assert.match(source, /bottom\/btn_last', false/);
    assert.doesNotMatch(source, /this\.page \+= 1; void this\.load\(true\)/);
});

test('成员筛选、搜索空结果、身份排序和普通圈积分列遵守业务口径', () => {
    assert.match(source, /Toggle\.EventType\.TOGGLE/);
    assert.match(source, /if \(query && rows\.length === 0\)[\s\S]*此玩家不存在[\s\S]*return/);
    assert.match(source, /Number\(row\.minister \?\? 0\) === 2 \? 0/);
    assert.match(source, /Boolean\(row\.isPromotionManage\) \? 2 : 3/);
    assert.match(source, /top\/ScoreTitle', Number\(this\.context\.unionId \?\? 0\) > 0/);
    assert.match(source, /this\.active\(node, 'ClubCent', Number\(this\.context\.unionId \?\? 0\) > 0\)/);
});
