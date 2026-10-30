import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const [neijiang, liangshan, registry, runtime, switcher] = await Promise.all([
  readFile(source('../../../assets/Games/Poker/PDK/NJPDK/Code/Neijiang2002RoomProfile.ts'), 'utf8'),
  readFile(source('../../../assets/Games/Poker/PDK/LSPDK/Code/Liangshan2003RoomProfile.ts'), 'utf8'),
  readFile(source('../../../assets/Games/Poker/PDK/Common/Code/Regional/PdkRegionalProfileRegistry.ts'), 'utf8'),
  readFile(source('../../../assets/Games/Poker/PDK/Common/Code/Runtime/PdkRuntime.ts'), 'utf8'),
  readFile(source('../../../assets/Games/Poker/PDK/Common/Code/Runtime/PdkSwitchCoordinator.ts'), 'utf8'),
]);

test('regional PDK profiles preserve their identities while sharing the common runtime', () => {
  assert.match(neijiang, /gameId:2002,gameCode:PDK_BUSINESS_CODES\.NEIJIANG/);
  assert.match(neijiang, /xqpArea:6,xqpGameType:5/);
  assert.match(liangshan, /gameId:2003,gameCode:PDK_BUSINESS_CODES\.LIANGSHAN/);
  assert.match(liangshan, /xqpArea:9,xqpGameType:5/);
  for (const profile of [neijiang, liangshan]) {
    assert.match(profile, /family:'poker:pao-de-kuai'/);
    assert.match(profile, /commonRuntime:'PDK\/Common'/);
    assert.doesNotMatch(profile, /canBeat|recognize\(|settlement\(|currentSeat|stateVersion/);
    assert.doesNotMatch(profile, /ProtocolAdapter|Adapter/);
  }
  assert.match(registry, /PDK_BUSINESS_CODES\.NEIJIANG\]:NEIJIANG2002_PROFILE/);
  assert.match(registry, /PDK_BUSINESS_CODES\.LIANGSHAN\]:LIANGSHAN2003_PROFILE/);
  assert.doesNotMatch(registry, /PdkRegionalProtocolAdapter/);
});

test('common runtime owns regional dispatch and switching', () => {
  assert.match(runtime, /`poker\.\$\{this\.options\.gameCode\}\.dispatch`/);
  assert.match(runtime, /poker\.\$\{this\.options\.gameCode\}\.state_push/);
  assert.match(switcher, /if \(!isPdkBusinessCode\(gameCode\)\)/);
  assert.match(switcher, /gameCode,/);
});

test('Liangshan published choices remain complete', () => {
  assert.match(liangshan, /\[1,2,3,4,5,'no_compare'\]/);
  assert.match(liangshan, /dealCardCount:8\|10/);
  assert.match(liangshan, /robDealerRule:'dealer_first'/);
  assert.match(liangshan, /compare_attachments/);
});
