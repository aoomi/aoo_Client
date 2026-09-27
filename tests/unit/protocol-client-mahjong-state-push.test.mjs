import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const protocol = fs.readFileSync(path.join(root,
  'assets/Common/Code/Runtime/network/ProtocolClient.ts'), 'utf8');

const directRoomStateExpression = protocol.match(
  /const directRoomState = ([\s\S]*?);\n\s*const directRoomEvent/,
)?.[1];
assert.ok(directRoomStateExpression, 'dispatchV2Push direct room-state classifier is missing');
const isDirectRoomState = new Function('envelope', `return (${directRoomStateExpression});`);

test('canonical Mahjong Xuezhan snapshot is dispatched as a direct room state', () => {
  assert.equal(isDirectRoomState({ msgId: 'mahjong.xuezhan.state_push' }), true);
});

test('existing common and poker direct room-state routes remain supported', () => {
  assert.equal(isDirectRoomState({ msgId: 'common.room.state_push' }), true);
  assert.equal(isDirectRoomState({ msgId: 'poker.CD201.state_push' }), true);
});

test('unknown Mahjong and wrapper actions cannot bypass the direct-state contract', () => {
  assert.equal(isDirectRoomState({ msgId: 'mahjong.other.state_push' }), false);
  assert.equal(isDirectRoomState({ msgId: 'protocol.v2.push', body: {
    action: 'mahjong.xuezhan.state_push',
  } }), false);
});

test('direct snapshots retain authority gating, stateVersion payload and causal requestId', () => {
  assert.match(protocol,
    /if \(directRoomState && ProtocolClient\.isRoomPush\(canonicalAction\)[\s\S]*?this\.roomPushGate\.accepts\(payload, envelope\)/);
  assert.match(protocol, /const causalId = envelope\.requestId;/);
  assert.match(protocol, /for \(const listener of listeners\) listener\(payload\);/);
});
