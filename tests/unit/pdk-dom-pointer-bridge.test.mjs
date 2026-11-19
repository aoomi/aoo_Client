import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const controller = readFileSync(new URL(
  '../../assets/Games/Poker/PDK/Common/Code/Runtime/PdkPlayController.ts',
  import.meta.url,
), 'utf8');

test('PDK DOM pointer bridge owns hand gestures only', () => {
  const bridge = controller.match(/private bindDomPointerBridge\(\): void \{[\s\S]*?\n    private readonly onDomPointerDown/);
  assert.ok(bridge, 'PDK DOM bridge block is missing');
  assert.match(bridge[0], /document\.addEventListener\('pointerdown'/);
  assert.match(controller, /this\.beginDragSelection\(sample\)/);
  assert.doesNotMatch(bridge[0], /getComponentsInChildren\(Button\)/);
  assert.doesNotMatch(bridge[0], /interactiveButtonAtUi|bridgedButton|Button\.EventType\.CLICK/);
});

test('PDK source does not capture or re-dispatch CommonRoom buttons', () => {
  assert.doesNotMatch(controller, /getComponentsInChildren\(Button\)/);
  assert.doesNotMatch(controller, /interactiveButtonAtUi/);
  assert.doesNotMatch(controller, /bridgedButton/);
  const bridge = controller.match(/private bindDomPointerBridge\(\): void \{[\s\S]*?\n    private unbindDomPointerBridge/);
  assert.ok(bridge, 'PDK DOM bridge block is missing');
  assert.doesNotMatch(bridge[0], /emit\(Button\.EventType\.CLICK/);
});

test('PDK DOM bridge leaves the canonical CommonRoom controls to Common', () => {
  assert.match(controller, /isInteractiveRoomControlAtUi\(sample\.ui\.x, sample\.ui\.y\)/);
  assert.match(controller, /Btn\/Btn_More/);
  assert.match(controller, /Btn\/Btn_Chat/);
  assert.match(controller, /Btn\/Btn_Voice/);
  assert.match(controller, /if \(this\.isInteractiveRoomControlAtUi\(sample\.ui\.x, sample\.ui\.y\)\) \{/);
  assert.match(controller, /ancestor = ancestor\.parent/);
  assert.match(controller, /interactable/);
  assert.match(controller, /return;/);
});

test('CommonRoom Head resolves from the CommonRoom bundle', () => {
  const lifecycle = readFileSync(new URL(
    '../../assets/Games/Common/Code/Runtime/GameRuntimeEntries.ts',
    import.meta.url,
  ), 'utf8');
  assert.match(lifecycle, /COMMON_ASSET_BUNDLE/);
  assert.match(lifecycle, /COMMON_HEAD_ASSET/);
  assert.match(lifecycle, /this\.setLayerRecursively\(head, host\.layer\)/);
  assert.match(lifecycle, /private setLayerRecursively\(node: Node, layer: number\)/);
});
