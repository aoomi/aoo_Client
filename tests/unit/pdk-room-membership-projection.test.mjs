import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const clientRoot = new URL('../..', import.meta.url).pathname;

test('same-version authority projections retain seat membership in their duplicate fingerprint', () => {
  const runtime = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkRuntime.ts'), 'utf8');
  assert.match(runtime, /const seatFingerprint = Object\.entries\(view\.seats \?\? \{\}\)/);
  assert.match(runtime, /Number\(seat\.playerId \?\? 0\)/);
  assert.match(runtime, /seatFingerprint,\s*\]/);
});

test('the room presentation clears an empty authority seat instead of rendering a placeholder head', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  assert.match(controller, /Number\(player\.pid \?\? 0\) <= 0/);
  assert.match(controller, /seats\.clearHead\(entry\.dataSeat, entry\.physicalSlot\)/);
});
