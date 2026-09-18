import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const controllerPath = new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts', import.meta.url);
const source = readFileSync(controllerPath, 'utf8');

function method(name, nextName) {
  const start = source.indexOf(`private ${name}`);
  const end = source.indexOf(`private ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must exist after ${name}`);
  return source.slice(start, end);
}

test('plain pointer selection begins only on an exact visible card hit', () => {
  const domDown = method('readonly onDomPointerDown', 'readonly onDomPointerMove');
  const cardBranch = domDown.indexOf('sample.index >= 0');
  const buttonBranch = domDown.indexOf('interactiveButtonAtUi');
  assert.ok(cardBranch >= 0 && cardBranch < buttonBranch,
    'a card covering chat/voice must own the pointer before the underlying button');
  assert.match(domDown, /this\.dragStartIndex = sample\.index/);
  assert.match(domDown, /this\.dragLastIndex = sample\.index/);
  assert.doesNotMatch(domDown, /dragIndexAtUi/,
    'empty bottom-hand coordinates must not be converted to the nearest card');
  assert.match(domDown, /this\.clearCardSelection\(\)/,
    'a pointer outside both cards and buttons must clear the complete selection');
});

test('native touch and mouse blank areas clear instead of selecting a nearby card', () => {
  const touchStart = method('onHandTouchStart', 'bindGestureSurface');
  const mouseDown = method('onHandMouseDown', 'onHandMouseMove');
  for (const handler of [touchStart, mouseDown]) {
    assert.match(handler, /if \(sample\.index < 0\) \{[\s\S]*this\.clearCardSelection\(\)[\s\S]*return;/);
    assert.match(handler, /this\.dragLastIndex = sample\.index/);
  }
});

test('exposed interactive buttons preserve selection and remain forwarded after exact-card arbitration', () => {
  const domDown = method('readonly onDomPointerDown', 'readonly onDomPointerMove');
  const domUp = method('readonly onDomPointerUp', 'readonly onDomPointerCancel');
  assert.match(domDown, /this\.bridgedButton = interactiveButton/);
  const buttonBranch = domDown.slice(domDown.indexOf('if (interactiveButton)'));
  assert.doesNotMatch(buttonBranch.slice(0, buttonBranch.indexOf('return;')), /clearCardSelection/,
    'functional buttons must not mutate the current card selection');
  assert.match(domUp, /bridgedButton === this\.interactiveButtonAtUi/);
  assert.match(domUp, /bridgedButton\.emit\(Button\.EventType\.CLICK/);
});
