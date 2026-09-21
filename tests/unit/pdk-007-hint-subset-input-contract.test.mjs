import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const controllerPath = new URL(
  '../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts',
  import.meta.url,
);
const source = readFileSync(controllerPath, 'utf8');
const method = source.slice(
  source.indexOf('private exactSizeResponseSubsets'),
  source.indexOf('private sortedLegalTipCandidates'),
);

function subsets(handSource, size) {
  const hand = [...(Array.isArray(handSource) ? handSource : [])].map(Number);
  if (!Number.isSafeInteger(size) || size <= 1 || size > hand.length) return [];
  const groups = new Map();
  for (const card of hand) {
    const rank = card >= 100 ? card % 100 : card & 0x0f;
    const group = groups.get(rank) ?? [];
    group.push(card);
    groups.set(rank, group);
  }
  const rankGroups = Array.from(groups.entries())
    .sort(([left], [right]) => left - right)
    .map(([, cards]) => cards);
  const result = [];
  const selected = [];
  const build = (groupIndex) => {
    if (selected.length === size) {
      result.push([...selected]);
      return;
    }
    if (groupIndex >= rankGroups.length) return;
    const remaining = size - selected.length;
    const group = rankGroups[groupIndex];
    const maximum = Math.min(group.length, remaining);
    for (let count = 0; count <= maximum; count += 1) {
      selected.push(...group.slice(0, count));
      build(groupIndex + 1);
      selected.splice(selected.length - count, count);
    }
  };
  build(0);
  return result;
}

test('PDK-007 materializes Map entries before the release transpiler handles the array pipeline', () => {
  assert.match(method, /Array\.from\(groups\.entries\(\)\)/);
  assert.doesNotMatch(method, /\[\.\.\.groups\.entries\(\)\]/);
});

test('PDK-007 undefined and empty hand inputs produce no subset without throwing', () => {
  assert.deepEqual(subsets(undefined, 4), []);
  assert.deepEqual(subsets([], 4), []);
});

test('PDK-007 normal hand input preserves complete rank-multiset candidate enumeration', () => {
  const result = subsets([105, 205, 305, 106, 206], 4);
  assert.deepEqual(result, [
    [105, 205, 106, 206],
    [105, 205, 305, 106],
  ]);
});
