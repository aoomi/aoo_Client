import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyClubForbidController.ts', import.meta.url), 'utf8');

test('forbid groups render into the visible mark layout instead of the demo layout', () => {
    const renderGroups = source.slice(source.indexOf('private renderGroups'), source.indexOf('private async addGroup'));
    assert.match(renderGroups, /const mark = form \? this\.desc\(form\.node, 'mark'\) : null/);
    assert.match(renderGroups, /const content = mark\?\.getChildByName\('layout'\) \?\? null/);
    assert.match(renderGroups, /const demo = mark\?\.getChildByName\('demo'\) \?\? null/);
    assert.doesNotMatch(renderGroups, /form \? this\.desc\(form\.node, 'layout'\) : null/);
});

test('adding a forbid group reloads the visible group list', () => {
    assert.match(source, /request\('club\.CClubGroupingAdd'/);
    assert.match(source, /await this\.loadGroups\(\)/);
});

test('group member management uses the explicit group owner instead of inferring from unionId', () => {
    assert.match(source, /groupingScope\?: 'club' \| 'union'/);
    assert.match(source, /groupingId: group\.groupingId, groupingScope: 'club'/);
    assert.match(source, /private isUnionGrouping\(\): boolean/);
    assert.doesNotMatch(source, /unionId > 0 \? 'union\.CUnionGroupingMemberList'/);
});
