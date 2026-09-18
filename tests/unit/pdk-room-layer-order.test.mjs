import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
  '../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts',
  import.meta.url,
), 'utf8');

function registration(form, nextForm) {
  const start = source.indexOf(`this.forms.register(${form}`);
  const end = source.indexOf(`this.forms.register(${nextForm}`, start + 1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}

test('general room controls render above gameplay while only chat and voice move below cards', () => {
  const common = registration('COMMON_ROOM_FORM', 'DISSOLVE_ROOM_FORM');
  const poker = registration('PDK_ROOM_FORM', 'POKER_CARD_SELECTION_FORM');
  const commonOrder = Number(common.match(/zOrder:\s*(\d+)/)?.[1]);
  const pokerOrder = Number(poker.match(/zOrder:\s*(\d+)/)?.[1]);
  assert.ok(commonOrder > pokerOrder,
    `Common room zOrder ${commonOrder} must keep back/more above PDK ${pokerOrder}`);

  const controller = readFileSync(new URL(
    '../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts',
    import.meta.url,
  ), 'utf8');
  const place = controller.slice(controller.indexOf('private placeCommonSocialControlsBelowCards'),
    controller.indexOf('private restoreCommonSocialControls'));
  assert.match(place, /CommonRoomNodePath\.voiceButton, CommonRoomNodePath\.chatButton/);
  assert.match(place, /state\.widget\.enabled = false/);
  assert.match(place, /node\.parent = gameplayRoot/);
  assert.match(place, /node\.setSiblingIndex\(players\?\.siblingIndex/);
  assert.match(controller, /convertToNodeSpaceAR\(state\.position\)/);
  assert.match(controller, /state\.widget\.enabled = state\.widgetEnabled/);
});
