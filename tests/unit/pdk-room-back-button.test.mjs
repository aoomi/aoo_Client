import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts', import.meta.url), 'utf8');

test('Btn_Back is the only room-menu exit contract', () => {
  assert.match(source, /this\.bind\('Btn\/RoomActions\/Btn_Menu\/Btn_Back', \(\) => this\.exitRoom\(\)\)/);
  assert.doesNotMatch(source, /Btn_Jiesan/);
});

test('only a dealt active round blocks exit with the required bubble text', () => {
  assert.match(source, /canLeaveRoom/);
  assert.match(source, /cardsDealt/);
  assert.doesNotMatch(source, /phase === 'PLAYING' \|\| phase === 'COMPETE_DEALER'/);
  assert.match(source, /this\.showMessage\('游戏中不能退出'\)/);
});

test('a waiting room delegates exit to the unified room leave flow', () => {
  assert.match(source, /this\.requestLeave\('user-exit'\)/);
  assert.doesNotMatch(source, /exitRoom\(\)[\s\S]*this\.lifecycle\.dissolve/);
});
