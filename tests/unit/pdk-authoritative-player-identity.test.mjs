import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const sourcePath = new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/PdkSwitchCoordinator.ts', import.meta.url);

test('PDK room runtime uses authenticated accountId as the authoritative wire seat identity', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /const authorityPlayerId = Number\(this\.account\.accountId\);/);
  assert.match(source, /playerId: authorityPlayerId,/);
  assert.doesNotMatch(source, /const authorityPlayerId = this\.playerId;/);
});
