import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gateway = readFileSync(new URL('../../assets/Lobby/Code/HallRoomGateway.ts', import.meta.url), 'utf8');

test('authoritative room handoff exposes canonical gameCode without bundle inference', () => {
    assert.match(gateway, /gameId: number; gameCode: string; gameName: string/);
    assert.match(gateway, /gameCode, gameName: gameCode/);
    assert.doesNotMatch(gateway, /bundleName[\s\S]{0,100}(?:infer|gameCode\s*=)/i);
});
