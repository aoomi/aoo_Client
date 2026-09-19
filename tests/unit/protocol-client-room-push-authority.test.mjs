import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const protocol = fs.readFileSync(path.join(root,
  'assets/Common/Code/Runtime/network/ProtocolClient.ts'), 'utf8');

test('room push authority is restored after the inherited connect lifecycle clears it', () => {
  assert.match(protocol, /public override async connect\(url: string, timeoutMs = 5000\)/);
  assert.match(protocol, /await super\.connect\(url, timeoutMs\)/);
  assert.match(protocol, /if \(authority\) this\.roomPushGate\.bind\(authority\.roomId, authority\.playVersion\)/);
  assert.ok(protocol.indexOf('await super.connect(url, timeoutMs)')
    < protocol.indexOf('this.roomPushGate.bind(authority.roomId, authority.playVersion)'),
  'authority must be restored only after the new socket is connected');
});

test('room authority remains strict and close still clears the active push gate', () => {
  assert.match(protocol, /this\.roomAuthority = Object\.freeze\(\{ roomId: normalizedRoomId, playVersion: normalizedVersion \}\)/);
  assert.match(protocol, /public override close\(\): void \{[\s\S]*this\.roomPushGate\.clear\(\);[\s\S]*super\.close\(\);/);
});
