import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const presenter = read('assets/Games/Poker/PDK/Common/Code/Runtime/Room/PdkFloatingPointsPresenter.ts');
const controller = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts');
const prefab = JSON.parse(read('assets/Games/Poker/PDK/Common/Prefab/PDK_CommonRoom.prefab'));

function nodePath(index) {
  const names = [];
  let cursor = index;
  while (Number.isInteger(cursor)) {
    const node = prefab[cursor];
    if (node?.__type__ === 'cc.Node') names.unshift(node._name);
    cursor = node?._parent?.__id__;
  }
  return names.join('/');
}

test('authored floating-point hierarchy remains the only presentation template', () => {
  const paths = prefab.flatMap((item, index) => item?.__type__ === 'cc.Node' ? [nodePath(index)] : []);
  for (const path of [
    'PDK_CommonRoom/RoomCommon/FloatingPoints',
    'PDK_CommonRoom/RoomCommon/FloatingPoints/WinLabel',
    'PDK_CommonRoom/RoomCommon/FloatingPoints/LoseLabel',
    'PDK_CommonRoom/RoomCommon/FloatingPoints/ResultEffect',
    ...[0, 1, 2, 3].map((slot) => `PDK_CommonRoom/RoomCommon/FloatingPoints/ResultEffect/Effect_${slot}`),
  ]) assert.ok(paths.includes(path), `missing ${path}`);
});

test('round settlement uses authoritative pointList and the shared seat mapping once per deal', () => {
  assert.match(controller, /event === 'CommonPdkSetEnd'[\s\S]*floatingPoints\?\.present\(packet, this\.authoritativePlayerCount\(\), seat\)/);
  assert.match(presenter, /authoritativePoints\(payload\.pointList, playerCount\)/);
  assert.match(presenter, /createSeatEntries\(playerCount, localSeat\)/);
  assert.match(presenter, /payload\.staticRestore === true/);
  assert.match(presenter, /const key = `\$\{roomId\}:\$\{roundNo\}:\$\{shuffleSequence\}`/);
  assert.doesNotMatch(presenter, /totalPointList/);
});

test('the existing authoritative settlement event carries the complete round identity', () => {
  const runtime = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkRuntime.ts');
  const settlement = runtime.slice(runtime.indexOf('const rawSetEnd ='),
    runtime.indexOf("this.options.onEvent?.('CommonPdkSetEnd', setEnd)"));
  assert.match(settlement, /roomId: view\.roomId/);
  assert.match(settlement, /roundNo: view\.roundNo/);
  assert.match(settlement, /shuffleSequence: view\.shuffleSequence/);
  assert.match(settlement, /stateVersion: view\.stateVersion/);
  assert.match(settlement, /staticRestore: force/);
});

test('physical seat offsets and animation timing follow the authored requirement', () => {
  assert.match(presenter, /physicalSlot === 0 \|\| entry\.physicalSlot === 3 \? 100 : -100/);
  assert.match(presenter, /const RISE_DISTANCE = 15/);
  assert.match(presenter, /const HOLD_SECONDS = 2/);
  assert.match(presenter, /easing: 'linear'/);
  assert.match(presenter, /point < 0 \? String\(point\) : `\+\$\{point\}`/);
  assert.match(presenter, /if \(point === 0\)[\s\S]*mount\.active = false;[\s\S]*continue/);
  assert.match(presenter, /instantiate\(point < 0 \? loseTemplate : winTemplate\)/);
  assert.doesNotMatch(presenter, /\.color\s*=|fontSize|outline/);
});

test('round and room lifecycle stop every floating score tween', () => {
  assert.match(controller, /private resetRoundPresentation\(\): void \{[\s\S]*this\.floatingPoints\?\.hide\(\)/);
  assert.match(controller, /this\.floatingPoints\?\.destroy\(\)/);
  assert.match(presenter, /Tween\.stopAllByTarget\(mount\)/);
});
