import assert from 'node:assert/strict';
import test from 'node:test';

import { PdkRoundPresentationLifecycle } from '../../assets/Games/Poker/PDK/Common/Code/Runtime/Room/PdkRoundPresentationLifecycle.ts';

const round = (roundNo, shuffleSequence) => ({
  roomId: 927550,
  roundNo,
  shuffleSequence,
  dealIdentity: '',
});

test('ending a round synchronously invalidates every async presentation lease', () => {
  const lifecycle = new PdkRoundPresentationLifecycle();
  const accepted = lifecycle.accept(round(5, 5));
  assert.equal(accepted.accepted, true);
  assert.equal(lifecycle.isCurrent(accepted.lease), true);

  lifecycle.end();
  assert.equal(lifecycle.isCurrent(accepted.lease), false);
});

test('a new deal invalidates the previous lease and owns one new lease', () => {
  const lifecycle = new PdkRoundPresentationLifecycle();
  const previous = lifecycle.accept(round(5, 5));
  const next = lifecycle.accept(round(6, 6));

  assert.equal(next.accepted, true);
  assert.equal(next.changed, true);
  assert.equal(lifecycle.isCurrent(previous.lease), false);
  assert.equal(lifecycle.isCurrent(next.lease), true);
});

test('phase packets from one deal share the same lease', () => {
  const lifecycle = new PdkRoundPresentationLifecycle();
  const dealt = lifecycle.accept(round(6, 6));
  const playing = lifecycle.accept(round(6, 6));

  assert.equal(playing.changed, false);
  assert.deepEqual(playing.lease, dealt.lease);
});

test('late snapshots cannot reopen an older round or shuffle', () => {
  const lifecycle = new PdkRoundPresentationLifecycle();
  const current = lifecycle.accept(round(6, 6));
  const staleDeal = lifecycle.accept(round(5, 5));
  const staleLegacyRound = lifecycle.accept({ ...round(5, -1), dealIdentity: '' });

  assert.equal(staleDeal.accepted, false);
  assert.equal(staleDeal.rejection, 'STALE_DEAL');
  assert.equal(staleLegacyRound.accepted, false);
  assert.equal(staleLegacyRound.rejection, 'STALE_ROUND');
  assert.equal(lifecycle.isCurrent(current.lease), true);
});

test('a rematch may wrap round number when shuffle identity advances', () => {
  const lifecycle = new PdkRoundPresentationLifecycle();
  const finalRound = lifecycle.accept(round(8, 8));
  const rematch = lifecycle.accept(round(1, 9));

  assert.equal(rematch.accepted, true);
  assert.equal(rematch.changed, true);
  assert.equal(lifecycle.isCurrent(finalRound.lease), false);
  assert.equal(lifecycle.isCurrent(rematch.lease), true);
});
