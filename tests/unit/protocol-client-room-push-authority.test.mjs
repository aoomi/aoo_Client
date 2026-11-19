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
  const connect = protocol.slice(protocol.indexOf('public override async connect'),
    protocol.indexOf('public bindRoomAuthority'));
  assert.match(connect, /if \(authority\) \{[\s\S]*this\.roomPushGate\.bind\(authority\.roomId, authority\.playVersion\);[\s\S]*this\.registerRoomClient\(authority\.roomId\);[\s\S]*\}/);
  const connected = connect.indexOf('await super.connect(url, timeoutMs)');
  const rebound = connect.indexOf('this.roomPushGate.bind(authority.roomId, authority.playVersion)');
  const registered = connect.indexOf('this.registerRoomClient(authority.roomId)');
  assert.ok(connected >= 0 && connected < rebound && rebound < registered,
    'authority bind and room-client registration must occur in order after connect');
});

test('room authority remains strict and close still clears the active push gate', () => {
  assert.match(protocol, /this\.roomAuthority = Object\.freeze\(\{ roomId: normalizedRoomId, playVersion: normalizedVersion \}\)/);
  assert.match(protocol, /public override close\(\): void \{[\s\S]*this\.roomPushGate\.clear\(\);[\s\S]*super\.close\(\);/);
});
