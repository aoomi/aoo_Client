import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { projectPdkOperationClock } from '../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkAuthoritativeViewAdapter.ts';

const controller = readFileSync(new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts', import.meta.url), 'utf8');
const adapter = readFileSync(new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkAuthoritativeViewAdapter.ts', import.meta.url), 'utf8');

test('the first projection and same-state reconnect retain an unlimited active seat', () => {
  const deadline = { operationId: 'op-17', seatId: 1, deadlineEpochMillis: 0, unlimited: true };
  const first = projectPdkOperationClock(deadline, 1_700_000_000_000);
  const reconnect = projectPdkOperationClock({ ...deadline }, 1_700_000_010_000);
  assert.deepEqual(first, { mode: 'unlimited', seatId: 1, seconds: 0 });
  assert.deepEqual(reconnect, first);
  assert.match(adapter, /const runWaitSec = projectPdkOperationClock\(operationDeadline, source\.serverEpochMillis\)\.seconds/);
  assert.match(adapter, /operationDeadline,\s*nextRoundDeadline/);
});

test('finite windows count down, while absent and expired authority windows are inactive', () => {
  assert.deepEqual(projectPdkOperationClock({
    operationId: 'op-18', seatId: 0, deadlineEpochMillis: 1_700_000_004_500,
  }, 1_700_000_000_000), { mode: 'timed', seatId: 0, seconds: 5 });
  assert.deepEqual(projectPdkOperationClock({}, 1_700_000_000_000), {
    mode: 'closed', seatId: -1, seconds: 0,
  });
  assert.deepEqual(projectPdkOperationClock({
    operationId: 'op-19', seatId: 0, deadlineEpochMillis: 1_700_000_000_000,
  }, 1_700_000_000_000), { mode: 'expired', seatId: 0, seconds: 0 });
});

test('the controller keeps the pointer, not the numeric clock, for unlimited turns', () => {
  const clock = controller.slice(controller.indexOf('private startClockFromSetInfo('),
    controller.indexOf('private hideClocks()'));
  assert.match(clock, /hasOwnProperty\.call\(packet, 'operationDeadline'\)/);
  assert.match(clock, /projectPdkOperationClock\(deadline,/);
  assert.match(clock, /clock\.mode === 'unlimited'\) this\.startClock\(clock\.seatId, null\)/);
  assert.match(clock, /clock\.mode === 'timed'\) this\.startClock\(clock\.seatId, clock\.seconds\)/);
  assert.match(clock, /this\.view\?\.visible\('Clock', Boolean\(entry\)\)/);
  assert.match(clock, /pointer\.active = Boolean\(entry\)/);
  assert.match(clock, /this\.view\?\.visible\('Clock\/Time', Boolean\(entry\) && !unlimited\)/);
  assert.match(clock, /if \(!unlimited\) this\.clockTimer = globalThis\.setInterval/);
  assert.doesNotMatch(clock, /packet\.runWaitSec/);
});

test('only an active authority operation can expose local play controls', () => {
  assert.match(controller, /const actionableTurn = authorityClock\.mode === 'unlimited' \|\| authorityClock\.mode === 'timed'/);
  assert.match(controller, /const authorityLocalTurn = state === 1 && actionableTurn/);
  assert.match(controller, /state === 1 && actionableTurn && this\.keepOperationsVisibleDuringPlay/);
});
