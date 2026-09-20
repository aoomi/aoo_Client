import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const base = new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/', import.meta.url);
const arrow = readFileSync(new URL('Room/PdkCurrentPlayArrowPresenter.ts', base), 'utf8');
const play = readFileSync(new URL('CommonPdkPlayController.ts', base), 'utf8');
const runtime = readFileSync(new URL('CommonPdkRuntime.ts', base), 'utf8');
const capabilities = readFileSync(new URL('../Regional/PdkGameplayCapabilities.ts', base), 'utf8');
const prefab = JSON.parse(readFileSync(new URL('../../Prefab/PDK_CommonRoom.prefab', base), 'utf8'));

test('current-play Arrow reuses XQP jiantou spine and appears only after a retained hand stops', () => {
  assert.match(arrow, /Spine\/jiantou\/skeleton/);
  assert.match(arrow, /setAnimation\(0, 'animation', true\)/);
  assert.match(arrow, /this\.root\.getChildByName\('RoomCommon'\)\?\.getChildByName\('Arrow'\)/);
  assert.match(arrow, /this\.authoredOffset = mount\.position\.clone\(\)/);
  assert.match(arrow, /!child\.name\.startsWith\('PlayCount'\)/);
  assert.match(arrow, /child\.getComponent\(UITransform\)\?\.getBoundingBoxToWorld\(\)/);
  assert.match(arrow, /Math\.min\(\.\.\.cardBounds\.map/);
  assert.match(arrow, /Math\.max\(\.\.\.cardBounds\.map/);
  assert.match(arrow, /\(left \+ right\) \/ 2/);
  assert.match(arrow, /cardTopCenter\.y \+ arrowHalfHeight \+ offset\.y/);
  assert.doesNotMatch(arrow, /new Node\('Arrow'\)/);
  const roomCommon = prefab.find((entry) => entry?.__type__ === 'cc.Node' && entry._name === 'RoomCommon');
  assert.ok(roomCommon, 'RoomCommon must exist');
  const fixedArrow = roomCommon._children
    .map((entry) => prefab[entry.__id__])
    .find((entry) => entry?._name === 'Arrow');
  assert.ok(fixedArrow, 'Arrow must be an authored RoomCommon child');
  assert.equal(fixedArrow._active, false);
  assert.deepEqual([fixedArrow._lscale.x, fixedArrow._lscale.y], [0.8, 0.8]);
  assert.match(play, /showCurrentPlayArrow\(parent, packet, true\)/);
  assert.match(play, /Play_\$\{operationId\}/);
  assert.match(play, /showCurrentPlayArrow\(retainedHand, packet, true\)/);
  assert.match(play, /if \(playIndex < this\.currentPlayArrowIndex\) return/);
  assert.match(play, /operationId !== this\.currentPlayArrowOperationId/);
  assert.match(play, /\[\.\.\.operations\]\.reverse\(\)/);
  assert.match(play, /operation && String\(operation\.action\)\.toLowerCase\(\) === 'play'/);
  assert.match(play, /currentPlayArrow\?\.hide\(\)/);
  assert.match(play, /this\.currentPlayArrow = new PdkCurrentPlayArrowPresenter/);
  assert.match(play, /values\.length > 0 && !this\.runtime\.arrangementEnabled\(\)/);
  assert.match(play, /if \(moved\) \{[\s\S]*showCurrentPlayArrow\(retainedHand, packet, true\)/);
  assert.match(runtime, /currentPlayArrowEnabled\(\): boolean/);
  assert.match(capabilities, /DEFAULT_PDK_GAMEPLAY_CAPABILITIES[\s\S]*currentPlayArrow: 'disabled'/);
  assert.match(capabilities, /PDK_BUSINESS_CODES\.LIANGSHAN[\s\S]*currentPlayArrow: 'enabled'/);
});
