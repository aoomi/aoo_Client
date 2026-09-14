import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const exists = (path) => existsSync(new URL(path, root));
const meta = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

test('real game-category configuration lives directly below Packs', () => {
  assert.equal(exists('assets/Games/Mahjong/Packs/Config/game.json'), true);
  assert.equal(exists('assets/Games/Mahjong/Packs/Pack01/Config'), false);
  assert.equal(exists('assets/Games/Poker/Packs/Pack01/Config'), false);
});

test('moved configuration directories preserve their Creator UUIDs', () => {
  assert.equal(meta('assets/Games/Mahjong/Packs/Config.meta').uuid, '175b425f-76ba-428d-94f0-33738b7949d4');
});

test('categories without real configuration do not receive placeholder directories', () => {
  assert.equal(exists('assets/Games/Poker/Packs/Config'), false);
  assert.equal(exists('assets/Games/Poker/Common/Config/Legacy/assets/njpdk/jsonData/Sound.json'), true);
  assert.equal(exists('assets/Games/LongCard/Packs/Config'), false);
  assert.equal(exists('assets/Games/WordCard/Packs/Config'), false);
});
