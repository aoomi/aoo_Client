import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const clientRoot = new URL('../..', import.meta.url).pathname;
const sourceRoot = join(clientRoot, 'assets/Games/Poker/PDK/Common/Code/Runtime/Room');

test('PDK uses one authoritative 2/3/4-player seat profile', () => {
  const source = readFileSync(join(sourceRoot, 'SeatPresenter.ts'), 'utf8');
  assert.match(source, /2:\s*Object\.freeze\(\[0, 2\]\)/);
  assert.match(source, /3:\s*Object\.freeze\(\[0, 1, 3\]\)/);
  assert.match(source, /4:\s*Object\.freeze\(\[0, 1, 2, 3\]\)/);
  assert.match(source, /dataSeat - localSeat \+ playerCount/);
  assert.match(source, /requirePdkPlayerCount/);
});

test('an authoritative empty position retains the public game head and hides player data', () => {
  const source = readFileSync(join(sourceRoot, 'SeatPresenter.ts'), 'utf8');
  assert.match(source, /controller\.showGamePlayer\(playerId > 0\)/);
  assert.match(source, /revision !== this\.headRevisions\.get\(dataSeat\)/);
  assert.match(source, /this\.headPlayerIds\.delete\(dataSeat\)/);
  assert.doesNotMatch(source, /mount\.active = false/);
  assert.doesNotMatch(source, /head\.destroy\(\)/);
});

test('public PDK room exposes only common authority operations in the base layer', () => {
  const lifecycle = readFileSync(join(sourceRoot, 'RoomLifecycleController.ts'), 'utf8');
  const operation = readFileSync(join(sourceRoot, 'OperationPresenter.ts'), 'utf8');
  for (const msgId of ['ready_req', 'play_req', 'pass_req', 'trusteeship_req', 'dissolve_req']) {
    assert.match(lifecycle, new RegExp(`common\\.room\\.${msgId}`));
  }
  assert.doesNotMatch(lifecycle, /common\.room\.unready_req/);
  assert.doesNotMatch(lifecycle, /common\.room\.start_req|public start\s*\(/);
  assert.match(operation, /canPass/);
  assert.match(operation, /canTip/);
  assert.match(operation, /canPlay/);
  assert.doesNotMatch(lifecycle + operation, /robDoor|openCard|addDouble|localStorage|legacy|fallback/i);
});
