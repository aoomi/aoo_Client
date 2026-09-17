import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts', import.meta.url), 'utf8');

test('delayed out-card diagnostics never read nodes destroyed by reconnect projection', () => {
  const method = source.slice(source.indexOf('private updateActionCardLayout'),
    source.indexOf('private async flyRemoteCards'));
  assert.match(method, /cardNodes\.filter\(\(card\) => card\?\.isValid && card\.parent === parent\)/);
  assert.match(method, /if \(!parent\.isValid\) return/);
  assert.match(method, /parentTransform\?\.isValid \? parentTransform\.contentSize\.width : null/);
  assert.match(method, /const currentCards = cardNodes\.filter/);
  assert.doesNotMatch(method, /const distinctX = new Set\(cardNodes\.map/);
});
