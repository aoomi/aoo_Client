import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const controller = readFileSync(new URL(
  '../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts',
  import.meta.url,
), 'utf8');

test('public PDK remaining-card counter displays digits without the 张 suffix', () => {
  assert.match(controller, /label\.string = count > 0 \? String\(count\) : ''/);
  assert.doesNotMatch(controller, /label\.string = count > 0 \? `\$\{count\}张`/);
});
