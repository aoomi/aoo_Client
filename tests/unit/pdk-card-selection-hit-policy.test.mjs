import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

const controllerPath = new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/PdkHandInputController.ts', import.meta.url);
const hintControllerPath = new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/PdkHintController.ts', import.meta.url);
const source = readFileSync(controllerPath, 'utf8');
const hintSource = readFileSync(hintControllerPath, 'utf8');

function method(name, nextName) {
  const start = source.indexOf(`public ${name}`);
  const end = source.indexOf(`public ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must exist after ${name}`);
  return source.slice(start, end).replaceAll('this.host.', 'this.');
}

function hintMethod(name, nextName) {
  const start = hintSource.indexOf(`public ${name}`);
  const end = hintSource.indexOf(`public ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must exist after ${name}`);
  return hintSource.slice(start, end).replaceAll('this.host.', 'this.');
}

function dragCommitProbe(hand, leading, chooseLegal) {
  const body = method('commitSmartDragSelection', 'largestLegalDragCandidates');
  const js = ts.transpileModule(`class DragCommitProbe { ${body} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const Probe = Function(`${js}\nreturn DragCommitProbe;`)();
  const probe = new Probe();
  probe.host = probe;
  let selected = [];
  let covered = [];
  probe.logic = {
    GetHandCard: () => hand,
    GetSelectCard: () => selected,
    ChangeSelectCard: (cards) => { selected = [...cards]; },
  };
  probe.cardNodes = hand.map(() => ({}));
  probe.cards = { previewDrag: () => {} };
  probe.orderedDragIndices = () => covered;
  probe.isAuthoritativeLeadingTurn = () => leading;
  probe.largestLegalDragCandidates = (cards) => chooseLegal(cards);
  probe.traceGesture = () => {};
  probe.traceOutCards = () => {};
  probe.runtime = { getPlayerId: () => 1, getRoomSet: () => ({ GetRoomSetInfo: () => ({}) }) };
  probe.record = () => null;
  probe.clearDragSelection = () => {};
  probe.resetPromptCycle = () => {};
  probe.updateSelection = () => {};
  probe.refresh = () => {};
  return {
    swipe(indices) {
      covered = indices;
      probe.commitSmartDragSelection({});
      return [...selected];
    },
    setSelection(cards) { selected = [...cards]; },
  };
}

test('a swipe selects the largest legal covered shape and never merges an earlier selection', () => {
  const hand = [105, 205, 305, 106, 108, 208];
  const probe = dragCommitProbe(hand, true, () => [[105, 205, 305, 108, 208]]);
  probe.setSelection([106]);
  assert.deepEqual(probe.swipe([0, 1, 2, 3, 4, 5]), [105, 205, 305, 108, 208]);
});

test('a lead drag without a complete legal shape keeps only its covered physical cards', () => {
  const hand = [105, 106, 107, 108, 109];
  const probe = dragCommitProbe(hand, true, () => []);
  assert.deepEqual(probe.swipe([0, 1, 2, 3]), [105, 106, 107, 108]);
});

test('an invalid response drag clears its selection instead of retaining unrelated cards', () => {
  const hand = [107, 207, 108, 208];
  const probe = dragCommitProbe(hand, false, () => []);
  probe.setSelection([107, 207]);
  assert.deepEqual(probe.swipe([2, 3]), []);
});

test('blank space inside the hand band starts a dormant drag and does not fabricate a card hit', () => {
  const domDown = method('readonly onDomPointerDown', 'readonly onDomPointerMove');
  const cardBranch = domDown.indexOf('sample.index >= 0');
  const blankBranch = domDown.indexOf('isInsideHandGestureArea(sample)');
  assert.ok(cardBranch >= 0 && cardBranch < blankBranch);
  assert.match(domDown, /isInsideHandGestureArea\(sample\)[\s\S]*this\.beginDragSelection\(sample\)/);
  assert.doesNotMatch(domDown, /dragIndexAtUi/);

  const begin = method('beginDragSelection', 'updateDragSelection');
  const update = method('updateDragSelection', 'previewDragSelection');
  assert.match(begin, /this\.dragStartIndex = sample\.index/);
  assert.match(update, /if \(this\.dragStartIndex < 0\) \{[\s\S]*this\.dragStartIndex = index/);
});

test('drag candidate generation uses only this interval for lead and response', () => {
  const largest = method('largestLegalDragCandidates', 'cancelDragSelection');
  assert.match(largest, /largestLegalPdkSubsets\(touched/);
  assert.match(largest, /this\.sortedLegalTipCandidates\(leading, 'DRAG', candidates\)/);
  assert.doesNotMatch(largest, /this\.sortedLegalTipCandidates\(false\)/);

  const sorted = hintMethod('sortedLegalTipCandidates', 'scoringBombGroups');
  assert.match(sorted, /strategy === 'DRAG'[\s\S]*rankPdkDragCandidates\(hand, candidates, fixedPlan\)/);
});

test('card hit-testing remains exact while the drag interval is contiguous and reversible', () => {
  const hit = method('cardIndexAtScreen', 'cardIndexAtUi');
  const update = method('updateDragSelection', 'previewDragSelection');
  assert.match(hit, /UITransform\.prototype\.hitTest\.call\(transform, screenPoint, windowId\)/);
  assert.match(update, /this\.dragIndices\.clear\(\)[\s\S]*coveredDragIndices\(this\.dragStartIndex, index\)/);
  assert.doesNotMatch(update, /coveredDragIndices\(this\.dragLastIndex, index\)/);
});
