import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..', '..');

test('create-room schema polling bypasses metadata cache', () => {
  const gateway = readFileSync(join(root, 'assets/Lobby/Code/HallRoomGateway.ts'), 'utf8');
  const selector = readFileSync(join(root, 'assets/Modules/CreateRoom/Code/PlaySelectorController.ts'), 'utf8');

  assert.match(gateway, /configuration\(game: HallCatalogGame, options: \{ readonly refresh\?: boolean \} = \{\}\)/);
  assert.match(gateway, /!options\.refresh && cached && cached\.expiresAt > Date\.now\(\)/);
  assert.match(selector, /configuration\(game, \{ refresh: true \}\)/);
});
