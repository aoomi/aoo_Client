import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const protocol = fs.readFileSync(path.join(root,
  'assets/Common/Code/Runtime/network/ProtocolClient.ts'), 'utf8');
const generatedDir = path.join(root, 'assets/Common/Code/Runtime/network');
const generated = [
  'GeneratedProtocolIds.ts',
  ...fs.readdirSync(generatedDir)
    .filter(name => /^GeneratedProtocolDefinitions\.\d{3}\.ts$/.test(name))
    .sort(),
].map(name => fs.readFileSync(path.join(generatedDir, name), 'utf8')).join('\n');

const directRoomStateExpression = protocol.match(
  /const directRoomState = ([\s\S]*?);\n\s*const directRoomEvent/,
)?.[1];
assert.ok(directRoomStateExpression, 'dispatchV2Push direct room-state classifier is missing');
const registeredRoomStateIds = new Set([
  'common.room.state_push',
  ...[...generated.matchAll(/'((?:mahjong|poker)\.[a-zA-Z0-9]+\.state_push)'\s*:/g)].map(match => match[1]),
]);
const isRegisteredRoomStatePush = msgId => registeredRoomStateIds.has(msgId);
const isDirectRoomState = new Function(
  'envelope', 'isRegisteredRoomStatePush', `return (${directRoomStateExpression});`,
);

test('canonical Mahjong Xuezhan snapshot is dispatched as a direct room state', () => {
  assert.equal(isDirectRoomState({ msgId: 'mahjong.xuezhan.state_push' }, isRegisteredRoomStatePush), true);
  assert.equal(isDirectRoomState({ msgId: 'mahjong.hzmj.state_push' }, isRegisteredRoomStatePush), true);
});

test('existing common and poker direct room-state routes remain supported', () => {
  assert.equal(isDirectRoomState({ msgId: 'common.room.state_push' }, isRegisteredRoomStatePush), true);
  assert.equal(isDirectRoomState({ msgId: 'poker.chengdu2001.state_push' }, isRegisteredRoomStatePush), true);
});

test('unknown Mahjong and wrapper actions cannot bypass the direct-state contract', () => {
  assert.equal(isDirectRoomState({ msgId: 'mahjong.other.state_push' }, isRegisteredRoomStatePush), false);
  assert.equal(isDirectRoomState({ msgId: 'protocol.v2.push', body: {
    action: 'mahjong.xuezhan.state_push',
  } }, isRegisteredRoomStatePush), false);
});

test('direct snapshots retain authority gating, stateVersion payload and causal requestId', () => {
  assert.match(protocol,
    /if \(directRoomState && ProtocolClient\.isRoomPush\(canonicalAction\)[\s\S]*?this\.roomPushGate\.accepts\(payload, envelope\)/);
  assert.match(protocol, /const causalId = envelope\.requestId;/);
  assert.match(protocol, /for \(const listener of listeners\) listener\(payload\);/);
});
