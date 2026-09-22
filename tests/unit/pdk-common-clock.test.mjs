import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../assets/Games/Poker/PDK/Common/', import.meta.url);
const controller = readFileSync(new URL('Code/Runtime/CommonPdkPlayController.ts', root), 'utf8');
const prefab = JSON.parse(readFileSync(new URL('Prefab/PDK_CommonRoom.prefab', root), 'utf8'));

function nodePath(index) {
  const parts = [];
  let node = prefab[index];
  while (node?.__type__ === 'cc.Node') {
    parts.unshift(node._name);
    node = node._parent?.__id__ == null ? null : prefab[node._parent.__id__];
  }
  return parts.join('/');
}

test('the room clock owns one pointer and one time label', () => {
  const paths = prefab
    .map((entry, index) => entry?.__type__ === 'cc.Node' ? nodePath(index) : '')
    .filter((path) => path.startsWith('PDK_CommonRoom/Clock'));
  assert.equal(paths.filter((path) => path === 'PDK_CommonRoom/Clock/Pointer').length, 1);
  assert.equal(paths.filter((path) => path.startsWith('PDK_CommonRoom/Clock/Pointer/')).length, 0);
  assert.equal(paths.filter((path) => path === 'PDK_CommonRoom/Clock/Time').length, 1);
  const rootNode = prefab.find((entry) => entry?.__type__ === 'cc.Node'
    && entry._name === 'PDK_CommonRoom' && entry._parent === null);
  const rootChildren = rootNode._children.map((child) => prefab[child.__id__]._name);
  assert.ok(rootChildren.indexOf('Clock') < rootChildren.indexOf('Players'));
});

test('the authority seat rotates the central pointer from the artwork upward baseline toward its player', () => {
  const clock = controller.slice(controller.indexOf('private startClock(dataSeat'),
    controller.indexOf('private stopClock'));
  assert.match(clock, /createSeatEntries\(this\.authoritativePlayerCount\(\), this\.clientSeat\(\)\)/);
  assert.match(clock, /this\.view\?\.label\('Clock\/Time', String\(remaining\)\)/);
  assert.match(clock, /this\.view\?\.find\('Clock\/Pointer'\)/);
  assert.match(clock, /const rotationZ = entry \? \(180 \+ entry\.physicalSlot \* 90\) % 360 : 0/);
  assert.match(clock, /pointer\.setRotationFromEuler\(0, 0, rotationZ\)/);
  assert.match(clock, /\[PdkTurnPointer\]/);
  assert.match(clock, /traceKey !== this\.lastTurnPointerTraceKey/);
  assert.doesNotMatch(clock, /Clock\/Pointer\/\$\{slot\}/);
  assert.match(clock, /Players\/Play_\$\{slot\}\/Clock`, false/);
});

test('the first playing phase restores the authoritative clock after round reset', () => {
  const phase = controller.slice(controller.indexOf("event === 'CommonPdk_AuthoritativePhaseChanged'"),
    controller.indexOf("event === 'CommonPdk_PosUpdate'"));
  const playing = phase.slice(phase.indexOf("if (to === 'PLAYING')"));
  assert.ok(playing.indexOf('this.resetRoundPresentation()')
    < playing.indexOf('this.startClockFromSetInfo(setInfo)'));
});
