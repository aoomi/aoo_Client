import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const clientRoot = new URL('../..', import.meta.url).pathname;

test('an ambiguous room leave is reconciled instead of fabricated from Hall state', () => {
  const source = readFileSync(join(clientRoot, 'assets/Lobby/Code/HallRoomGateway.ts'), 'utf8');
  assert.match(source, /hall-room-leave-reconcile:/);
  assert.doesNotMatch(source, /return \{ roomId, status: 'LEFT' \}/);
});
