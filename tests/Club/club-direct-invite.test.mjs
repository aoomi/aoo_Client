import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(
    new URL('../../assets/Club/Code/Runtime/LegacyClubMainController.ts', import.meta.url),
    'utf8',
);

test('club ID invite reports immediate membership instead of pending acceptance', () => {
    assert.match(source, /CClubFindPIDAdd/);
    assert.match(source, /输入成员ID，确认后直接加入/);
    assert.match(source, /CClubFindPIDAdd[\s\S]*CClubFindPIDInfo[\s\S]*成员未实际加入，请重试/);
    assert.match(source, /成员已加入俱乐部并归属在您名下/);
    assert.doesNotMatch(source, /邀请已发送/);
});
