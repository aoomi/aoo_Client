import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCreateRoomSubmission,
  createRoomConfirmExpression,
  isCreateRoomConfirmReady,
} from '../../work/mahjong-cd101-full-e2e.mjs';

const ready = {
  selectedGameCode: 'chengdu1001',
  selectedGameId: 1001,
  selectorStable: true,
  configResponseSeen: true,
  configFailed: false,
  buttonName: 'Btn_Create',
  buttonActive: true,
  buttonInteractable: true,
  buttonLabel: '创建房间',
};

test('CD101 create confirm requires successful config and an enabled native create button', () => {
  assert.equal(isCreateRoomConfirmReady(ready), true);
  assert.equal(isCreateRoomConfirmReady({ ...ready, configResponseSeen: false }), false,
    'CONFIG_FINALLY without a successful response must not authorize confirm');
  assert.equal(isCreateRoomConfirmReady({ ...ready, configFailed: true }), false,
    'a failed rule configuration must fail closed');
  assert.equal(isCreateRoomConfirmReady({ ...ready, buttonInteractable: false }), false,
    'a disabled native Button must not be clicked');
  assert.equal(isCreateRoomConfirmReady({ ...ready, buttonLabel: '规则加载中...' }), false,
    'loading label must not be mistaken for a ready create action');
  assert.equal(isCreateRoomConfirmReady({ ...ready, selectedGameCode: 'neijiang2002' }), false,
    'a different selected game must not satisfy the CD101 gate');
  const expression = createRoomConfirmExpression();
  assert.match(expression, /button\?\.interactable/,
    'coordinate resolution must reject the disabled native Button');
  assert.match(expression, /buttonText === '创建房间'/,
    'coordinate resolution must require the post-configuration button label');
});

test('CD101 create E2E requires one submit, validation, Hall request and response in order', () => {
  const events = [
    { source: 'create-submit', stage: 'click' },
    { source: 'create-submit', stage: 'validated' },
    { source: 'hall-create', stage: 'request' },
    { source: 'hall-create', stage: 'response' },
  ];
  assert.equal(assertCreateRoomSubmission(events), true);
  assert.throws(() => assertCreateRoomSubmission(events.slice(1)), /exactly one create-submit:click/);
  assert.throws(() => assertCreateRoomSubmission([...events, events[0]]), /exactly one create-submit:click/);
  assert.throws(() => assertCreateRoomSubmission([events[0], events[2], events[1], events[3]]), /occur in order/);
});
