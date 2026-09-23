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

test('bottom-band blank space may start a drag without fabricating a card hit', () => {
  const domDown = method('readonly onDomPointerDown', 'readonly onDomPointerMove');
  const cardBranch = domDown.indexOf('sample.index >= 0');
  const buttonBranch = domDown.indexOf('interactiveButtonAtUi');
  const blankBranch = domDown.indexOf('isInsideHandGestureArea(sample)');
  assert.ok(cardBranch >= 0 && cardBranch < buttonBranch,
    'a card covering chat/voice must own the pointer before the underlying button');
  assert.ok(buttonBranch >= 0 && buttonBranch < blankBranch,
    'a functional button must own its hit before bottom-band blank drag capture');
  assert.match(domDown, /this\.beginDragSelection\(sample\)/);
  assert.match(domDown, /isInsideHandGestureArea\(sample\)[\s\S]*this\.beginDragSelection\(sample\)/);
  assert.doesNotMatch(domDown, /dragIndexAtUi/,
    'empty bottom-hand coordinates must not be converted to the nearest card');
  assert.match(domDown, /this\.clearCardSelection\(\)/,
    'a pointer outside cards, buttons and the bottom band clears selection');
});

test('bottom-band membership uses the complete visible screen width, not stale hand-node bounds', () => {
  const area = method('isInsideHandGestureArea', 'beginDragSelection');
  assert.match(area, /view\.getVisibleOrigin\(\)/);
  assert.match(area, /view\.getVisibleSize\(\)/);
  assert.match(area, /sample\.ui\.x >= origin\.x/);
  assert.match(area, /sample\.ui\.x <= origin\.x \+ size\.width/);
  assert.match(area, /sample\.ui\.y <= origin\.y \+ size\.height \* 0\.5/);
  assert.doesNotMatch(area, /handLocal|transform\.width|anchorPoint/,
    'screen-edge blank starts must not depend on delayed Hand_TouchArea geometry');
});

test('native blank starts enter a dormant drag until the first exact card hit', () => {
  const touchStart = method('onHandTouchStart', 'bindGestureSurface');
  const mouseDown = method('onHandMouseDown', 'onHandMouseMove');
  const begin = method('beginDragSelection', 'updateDragSelection');
  for (const handler of [touchStart, mouseDown]) {
    assert.match(handler, /this\.beginDragSelection\(sample\)/);
    assert.match(handler, /sample\.index < 0 && this\.interactiveButtonAtUi\(sample\.ui\.x, sample\.ui\.y\)/,
      'native functional buttons must remain outside blank-drag capture');
    assert.doesNotMatch(handler, /sample\.index < 0[\s\S]*clearCardSelection/);
  }
  assert.match(begin, /this\.dragStartIndex = sample\.index/);
  assert.match(begin, /this\.dragLastIndex = sample\.index/);
  assert.match(begin, /if \(sample\.index >= 0\) this\.dragIndices\.add\(sample\.index\)/);

  const update = method('updateDragSelection', 'previewDragSelection');
  assert.match(update, /if \(this\.dragStartIndex < 0\) \{[\s\S]*this\.dragStartIndex = index[\s\S]*this\.dragMoved = true/);
});

test('backtracking replaces the active swipe interval instead of accumulating visited cards', () => {
  const update = method('updateDragSelection', 'previewDragSelection');
  assert.match(update, /this\.dragIndices\.clear\(\)[\s\S]*coveredDragIndices\(this\.dragStartIndex, index\)/);
  assert.match(update, /this\.dragLastIndex = index/);
  assert.doesNotMatch(update, /coveredDragIndices\(this\.dragLastIndex, index\)/);

  for (const [start, end] of [
    ['readonly onDomPointerMove', 'readonly onDomPointerUp'],
    ['onHandTouchMove', 'onHandTouchCancel'],
    ['onHandMouseMove', 'onHandMouseUp'],
  ]) {
    assert.match(method(start, end), /this\.updateDragSelection\(sample\.index\)/);
  }
});

test('manual swipe maximizes card count before its separate loose-single strategy', () => {
  const largest = method('largestLegalDragCandidates', 'cancelDragSelection');
  assert.match(largest, /largestLegalPdkSubsets\(touched/);
  assert.match(largest, /sortedLegalTipCandidates\(candidates, leading, leading, false, 'DRAG'\)/);
  assert.doesNotMatch(source, /private legalManualDragCandidates/,
    'swipe must still reuse the authority legality path');

  const hint = method('prepareHintCache', 'consumeQueuedHintAfterPlay');
  assert.match(hint, /sortedLegalTipCandidates\(local, leading, leading\)/,
    'manual Hint must continue using its original strategy');
  const sorted = method('sortedLegalTipCandidates', 'protectedBombGroups');
  assert.match(sorted, /if \(strategy === 'DRAG'\) \{[\s\S]*rankPdkDragCandidates/);
  assert.ok(sorted.indexOf("strategy === 'DRAG'") < sorted.indexOf('const rankCandidates ='),
    'drag ranking must exit before Hint bomb, control and whole-hand priorities');
});

test('commit preserves the physical touched pool before strategic tie-breaking', () => {
  const commit = method('commitSmartDragSelection', 'largestLegalDragCandidates');
  const ordered = method('orderedDragIndices', 'traceGesture');
  assert.match(commit, /const touched = this\.orderedDragIndices\(\)\.map/);
  assert.doesNotMatch(commit, /sortedDragIndices\(\)\.map/);
  assert.match(ordered, /const step = this\.dragLastIndex >= this\.dragStartIndex \? 1 : -1/);
  assert.match(ordered, /index === this\.dragLastIndex/);
});

test('exposed interactive buttons preserve selection and remain forwarded after exact-card arbitration', () => {
  const domDown = method('readonly onDomPointerDown', 'readonly onDomPointerMove');
  const domUp = method('readonly onDomPointerUp', 'readonly onDomPointerCancel');
  const hit = method('interactiveButtonAtUi', 'sampleFromPointer');
  assert.match(domDown, /this\.bridgedButton = interactiveButton/);
  const buttonBranch = domDown.slice(domDown.indexOf('if (interactiveButton)'));
  assert.doesNotMatch(buttonBranch.slice(0, buttonBranch.indexOf('return;')), /clearCardSelection/,
    'functional buttons must not mutate the current card selection');
  assert.match(domUp, /bridgedButton === this\.interactiveButtonAtUi/);
  assert.match(domUp, /bridgedButton\.emit\(Button\.EventType\.CLICK/);
  assert.match(hit, /while \(root\.parent\) root = root\.parent/,
    'popup buttons in sibling forms must be searched from the shared UI root');
  assert.match(hit, /root\.getComponentsInChildren\(Button\)/);
});

test('full-screen backdrop buttons do not swallow empty-space deselection', () => {
  const hit = method('interactiveButtonAtUi', 'sampleFromPointer');
  assert.match(hit, /candidate === root/);
  assert.match(hit, /worldWidth >= visibleSize\.width \* 0\.8/);
  assert.match(hit, /worldHeight >= visibleSize\.height \* 0\.8/);
});
