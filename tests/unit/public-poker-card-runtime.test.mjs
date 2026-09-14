import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const clientRoot = join(import.meta.dirname, '../..');
const read = (path) => readFileSync(join(clientRoot, path), 'utf8');

test('PDK room and replay use the one public Poker_Card factory', () => {
  const room = read('assets/Games/Poker/PDK/Common/Code/Runtime/Room/CardPresenter.ts');
  const replay = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkReplayController.ts');
  const factory = read('assets/Games/Poker/Common/Code/Card/Poker_Card_Factory.ts');
  assert.match(room, /Poker_Card_Factory/);
  assert.match(replay, /Poker_Card_Factory/);
  assert.match(factory, /POKER_CARD_BUNDLE = 'poker-common'/);
  assert.match(factory, /POKER_CARD_ASSET = 'Prefab\/Poker_Card'/);
  assert.doesNotMatch(room + replay + factory, /common-poker-card(?:['"]|\/)|poker_card\/card|legacy-ui\/assets\/njpdk\/texture\/new_poker/);
});

test('public card state changes remain inside Poker_Card_Presenter', () => {
  const presenter = read('assets/Games/Poker/Common/Code/Card/Poker_Card_Presenter.ts');
  assert.match(presenter, /public setSelected\(selected: boolean\)/);
  assert.match(presenter, /public setDisabled\(disabled: boolean\)/);
  assert.doesNotMatch(presenter, /Rank_Bottom|rankBottom/);
  assert.match(presenter, /if \(this\.faceCenter\)/);
  assert.doesNotMatch(presenter, /\|\| !this\.faceCenter/);
});

test('public card factory lazy-loads the authoritative card atlas before the prefab', () => {
  const factory = read('assets/Games/Poker/Common/Code/Card/Poker_Card_Factory.ts');
  assert.match(factory, /POKER_CARD_ATLAS_BUNDLE = 'common'/);
  assert.match(factory, /POKER_COMMON_ATLAS = 'Atlas\/Poker_Common'/);
  assert.match(factory, /loadSkin\(\)/);
  assert.match(factory, /getSpriteFrame\(name\)/);
  for (const frame of ['card_front', 'card_back_0', 'card_mask', 'card_front_out']) {
    assert.match(factory, new RegExp(frame));
  }
  assert.ok(factory.indexOf('bundle(POKER_CARD_BUNDLE)') < factory.indexOf('bundle(POKER_CARD_ATLAS_BUNDLE)'));
  assert.doesNotMatch(factory, /common-poker-card['"]|poker_card\/card/);
});

test('public card factory decodes only the authoritative decimal card protocol', () => {
  const factory = read('assets/Games/Poker/Common/Code/Card/Poker_Card_Factory.ts');
  assert.match(factory, /Math\.floor\(rawCard \/ 100\)/);
  assert.match(factory, /protocolRank === 15 \? 2 : protocolRank/);
  assert.match(factory, /Poker_Card_Suit\.Diamond[\s\S]*Poker_Card_Suit\.Club[\s\S]*Poker_Card_Suit\.Heart[\s\S]*Poker_Card_Suit\.Spade/);
  assert.match(factory, /protocolSuit === 5 && \(protocolRank === 16 \|\| protocolRank === 17\)/);
  assert.doesNotMatch(factory, /& 0xf0|& 0x0f|rawCard - 500/);
});
