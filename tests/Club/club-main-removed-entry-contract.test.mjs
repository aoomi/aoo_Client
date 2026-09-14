import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyClubMainController.ts', import.meta.url), 'utf8');

test('removed club switch and bottom room manager entries have no runtime bindings', () => {
    assert.doesNotMatch(source, /top\/btn_changeclub/);
    assert.doesNotMatch(source, /left_wanfa\/btn_changeclub/);
    assert.doesNotMatch(source, /bottom\/btn_RoomMgr/);
});
