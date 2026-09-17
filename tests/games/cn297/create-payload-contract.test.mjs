import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = relative => readFile(fileURLToPath(new URL(
    `../../../assets/Games/Poker/ZJH/Common/Code/${relative}`, import.meta.url)), 'utf8');

test('CN297 create payload uses its canonical identity and workbook defaults', async () => {
    const rules = await source('CN297Rules.ts');
    const protocol = await source('CN297Protocol.ts');
    assert.match(rules, /CN297_GAME_CODE = 'CN297'/);
    assert.match(rules, /CN297_FAMILY = 'poker:compare-hand'/);
    assert.match(rules, /CN297_PLAY_VERSION = 'cn297-v1\.0\.0'/);
    for (const expected of [
        'totalRounds: 10', 'seatLimit: 8', 'minimumPlayers: 2', 'operationSeconds: 10',
        'compareStartRound: 5', 'maximumBet: 50', 'mustBlindRounds: 1', 'baseBet: 1',
        'aaaBonus: 20', 'leopardBonus: 10', 'straightFlushBonus: 5',
    ]) assert.ok(rules.includes(expected), expected);
    assert.match(protocol, /createCN297RoomBody\(rules: CN297RoomRules = CN297_DEFAULT_RULES\)/);
    assert.match(protocol, /gameCode: CN297_GAME_CODE, playVersion: CN297_PLAY_VERSION/);
    assert.match(protocol, /family: CN297_FAMILY, \.\.\.validateCN297Rules\(rules\)/);
});

test('CN297 validation mirrors every discrete workbook option', async () => {
    const rules = await source('CN297Rules.ts');
    for (const options of [
        '[10, 20, 30].includes(value.totalRounds)', '[8, 10].includes(value.seatLimit)',
        '[2, 4, 6].includes(value.minimumPlayers)', '[10, 15, 20].includes(value.operationSeconds)',
        '[1, 3, 5].includes(value.compareStartRound)', '[10, 20, 50].includes(value.maximumBet)',
        '[0, 1, 2].includes(value.mustBlindRounds)', '[1, 2, 5, 10].includes(value.baseBet)',
    ]) assert.ok(rules.includes(options), options);
});

test('CN297 empty seats write their selected seatId but UI never joins or readies', async () => {
    const protocol = await source('CN297Protocol.ts');
    const presenter = await source('CN297RoomPresenter.ts');
    const view = await source('CN297RoomViewAdapter.ts');
    const controller = await source('CN297RoomController.ts');
    assert.match(protocol, /sit: 'poker\.CN297\.sit_req'/);
    assert.match(protocol, /sit\(seatId: number\)/);
    assert.doesNotMatch(protocol, /join_req|ready_req|\bready\(/);
    assert.match(presenter, /snapshot\.state === 'WAITING' && snapshot\.viewerRole === 'SPECTATOR'/);
    assert.match(presenter, /canStart: snapshot\.state === 'WAITING' && snapshot\.viewerRole === 'SEATED'/);
    assert.match(presenter, /canContinue: snapshot\.state === 'ROUND_FINISHED' && snapshot\.viewerRole === 'SEATED'/);
    assert.match(view, /phase === 'WAITING' \? '已坐下'/);
    assert.match(view, /this\.actionSink\.sit\(seat\)/);
    assert.match(view, /this\.sittableSeats\.has\(seat\)/);
    assert.doesNotMatch(view, /Btn_(Ready|Sit)|canReady|'ready'/);
    assert.match(controller, /snapshot\.state !== 'WAITING' \|\| snapshot\.viewerRole !== 'SPECTATOR'/);
    assert.match(controller, /!snapshot \|\| snapshot\.viewerRole !== 'SEATED'/);
    assert.match(controller, /return this\.protocol\.state\(\)\.then\(value => this\.accept\(value\)\)/);
});
