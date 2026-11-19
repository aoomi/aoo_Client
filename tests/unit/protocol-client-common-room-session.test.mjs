import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../assets/Common/Code/Runtime/network/ProtocolClient.ts', import.meta.url), 'utf8');

test('room session registry is symmetric and rejects zero or multiple active clients', () => {
    assert.match(source, /private static readonly activeRoomClients/);
    assert.match(source, /this\.registerRoomClient\(authority\.roomId\)/);
    assert.match(source, /public override close\(\): void \{[\s\S]*?this\.unregisterRoomClient\(\)/);
    assert.match(source, /if \(clients\.length !== 1\) throw new Error\(`COMMON_ROOM_SESSION_CLIENT_COUNT:\$\{clients\.length\}`\)/);
});

test('room callbacks reject stale generation and release listeners/cursors on teardown', () => {
    assert.match(source, /private commonRoomGeneration = 0/);
    assert.match(source, /const generation = this\.commonRoomGeneration/);
    assert.match(source, /if \(generation !== this\.commonRoomGeneration\) \{[\s\S]*?COMMON_ROOM_SESSION_CHANGED/);
    assert.match(source, /private readonly causalGuard = new CausalEventGuard\(\)/);
    assert.match(source, /this\.causalGuard\.dispatch\('network', causalId/);
    assert.match(source, /listeners\.delete\(listener\)/);
    assert.match(source, /commonRoomListeners\.delete\(normalizedRoomId\)/);
    assert.match(source, /commonRoomSnapshots\.delete\(roomId\)/);
    assert.match(source, /commonRoomCursors\.delete\(roomId\)/);
});

test('only gated public snapshots and canonical social events reach Common listeners', () => {
    const gate = source.indexOf('!this.roomPushGate.accepts(payload, envelope)');
    const publish = source.indexOf("this.publishCommonRoom({ kind: 'snapshot'");
    assert.ok(gate >= 0 && publish > gate);
    for (const event of ['room.quick_text', 'room.magic_expression', 'room.voice']) assert.ok(source.includes(event));
    assert.doesNotMatch(source, /publishCommonRoom\([^\n]*(ticket|header|cookie)/i);
});

test('common dispatch is normalized and unknown commands fail closed without fallback', () => {
    assert.match(source, /command === 'chat\.quickText' \? 'quick_text'/);
    assert.match(source, /command === 'voice' \? 'voice'/);
    assert.match(source, /'magic_expression'/);
    assert.match(source, /COMMON_ROOM_COMMAND_UNSUPPORTED/);
    assert.match(source, /this\.request<unknown>\('common\.room\.dispatch'/);
});
