import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const fixture = JSON.parse(fs.readFileSync(new URL(
  '../fixtures/pdk-authority-projection-sequences.json', import.meta.url), 'utf8'));

function project(events, initialRoundNo) {
  let roundNo = initialRoundNo;
  let stateVersion = -1;
  let trickId = -1;
  const rendered = new Map();
  const output = [];
  for (const event of events) {
    const eventRound = Number(event.roundNo ?? roundNo);
    if (eventRound !== roundNo) {
      roundNo = eventRound;
      stateVersion = -1;
      trickId = -1;
      rendered.clear();
    }
    if (Number(event.stateVersion) < stateVersion) {
      output.push(snapshot(event.step, rendered));
      continue;
    }
    stateVersion = Number(event.stateVersion);
    if (Number(event.trickId) !== trickId) {
      trickId = Number(event.trickId);
      rendered.clear();
    }
    if (event.action === 'PLAY' && event.cards.length > 0 && !rendered.has(event.operationId)) {
      rendered.set(event.operationId, { seat: String(event.seat), cards: [...event.cards] });
    }
    output.push(snapshot(event.step, rendered));
  }
  return output;
}

function snapshot(step, rendered) {
  const visibleBySeat = {};
  for (const value of rendered.values()) visibleBySeat[value.seat] = value.cards;
  const operationIds = [...rendered.keys()];
  return {
    step,
    renderedOperationIds: operationIds,
    visibleBySeat,
    playCountOperationId: operationIds.at(-1) ?? '',
  };
}

test('authority projection fixture defines duplicate, reconnect, trick, and round boundaries', () => {
  assert.deepEqual(project(fixture.events, fixture.roundNo), fixture.expected);
});

test('every visible hand is owned by exactly one operation id and preserves physical card ids', () => {
  for (const expected of fixture.expected) {
    assert.equal(new Set(expected.renderedOperationIds).size, expected.renderedOperationIds.length);
    for (const cards of Object.values(expected.visibleBySeat)) {
      assert.equal(new Set(cards).size, cards.length);
      assert.ok(cards.every(Number.isSafeInteger));
    }
  }
});
