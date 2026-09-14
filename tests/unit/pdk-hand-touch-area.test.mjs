import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const clientRoot = new URL('../..', import.meta.url).pathname;
const prefabPath = join(clientRoot, 'assets/Games/Poker/PDK/Common/Prefab/PDK_CommonRoom.prefab');
const controllerPath = join(clientRoot, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts');

test('Hand_TouchArea is independent from the visual Hand_Cards layout', () => {
  const serialized = JSON.parse(readFileSync(prefabPath, 'utf8'));
  const names = serialized.filter((item) => item?.__type__ === 'cc.Node').map((item) => item._name);
  const controller = readFileSync(controllerPath, 'utf8');

  assert.equal(names.filter((name) => name === 'Hand_TouchArea').length, 1);
  const touchIndex = serialized.findIndex((item) => item?.__type__ === 'cc.Node' && item._name === 'Hand_TouchArea');
  const touchNode = serialized[touchIndex];
  const touchTransform = touchNode._components.map((item) => serialized[item.__id__])
    .find((item) => item?.__type__ === 'cc.UITransform');
  assert.equal(serialized[touchNode._parent.__id__]._name, 'Card');
  assert.equal(touchTransform._contentSize.width, 1280);
  assert.equal(touchTransform._contentSize.height, 186.4);
  assert.match(controller, /bindGestureSurface\(this\.view\.find\('Players\/Play_0\/Card\/Hand_TouchArea'\)\)/);
  assert.match(controller, /const parent = this\.view\?\.find\('Players\/Play_0\/Card\/Hand_Cards'\)/);
  assert.match(controller, /const hand = this\.view\?\.find\('Players\/Play_0\/Card\/Hand_TouchArea'\)/);
  assert.match(controller, /view\.getVisibleSize\(\)\.width \/ worldScaleX/);
  assert.match(controller, /transform\.setContentSize\(visibleWidth, transform\.height\)/);
  assert.match(controller, /handLayout\.enabled = true;\s*handLayout\.updateLayout\(\)/);
  assert.match(controller, /if \(handLayout\) handLayout\.enabled = false;\s*this\.syncHandTouchArea\(\)/);
  assert.match(controller, /const widthAlreadyApplied = Math\.abs\(transform\.width - visibleWidth\) < 0\.01/);
  assert.doesNotMatch(controller, /isPointInHandTouchArea/);
  assert.match(controller, /if \(sample\.index >= 0\) \{\s*this\.dragIndices\.add\(sample\.index\)/);
  assert.match(controller, /if \(this\.dragIndices\.size > 0\) this\.commitSmartDragSelection\(sample\)/);
  assert.match(controller, /this\.interactiveButtonAtUi\(sample\.ui\.x, sample\.ui\.y\)/);
  assert.match(controller, /!this\.competeDealerPhase/);
  assert.match(controller, /GetRoomProperty\('state'\).*=== 1/s);
  assert.match(controller, /legacyHitTargets\.push\(\.\.\.target\.children\)/);
  assert.match(controller, /legacyButton\.enabled = false/);
  assert.match(controller, /cardTransform\.hitTest = \(\) => false/);
  assert.match(controller, /const screenPoint = new Vec2\(screenX, screenY\)/);
  assert.match(controller, /UITransform\.prototype\.hitTest\.call\(transform, screenPoint, windowId\)/);
  assert.match(controller, /for \(let index = this\.cardNodes\.length - 1; index >= 0; index -= 1\)/);
  assert.match(controller, /private bindGestureSurface\(surface: Node \| null\): void \{[\s\S]*this\.unbindDomPointerBridge\(\)/);
  assert.doesNotMatch(controller, /operationButtonAtUi/);
  assert.match(controller, /surface\.on\(Node\.EventType\.TOUCH_START, this\.onHandTouchStart/);
  assert.match(controller, /surface\.on\(Node\.EventType\.MOUSE_DOWN, this\.onHandMouseDown/);
  assert.match(controller, /const ui = event\.getUILocation\(\)/);
  assert.match(controller, /Buttons and the dedicated hand surface share Cocos' native input space/);
  assert.match(controller, /const normalizedX = bounds\?\.width \? canvasX \/ bounds\.width : 0/);
  assert.match(controller, /const uiX = visibleOrigin\.x \+ normalizedX \* visibleSize\.width/);
  assert.match(controller, /const uiY = visibleOrigin\.y \+ \(1 - normalizedY\) \* visibleSize\.height/);
  assert.doesNotMatch(controller, /devicePixelRatio|canvas\?\.width \?\? bounds\.width/);
  assert.match(controller, /transform\.convertToNodeSpaceAR\(world\)/);
  assert.match(controller, /bridgedButton\.emit\(Button\.EventType\.CLICK/);
  assert.match(controller, /if \(this\.capturedPointerId !== null\) \{[\s\S]*releasePointerCapture\(this\.capturedPointerId\)[\s\S]*this\.cancelDragSelection\(\)/);
  assert.doesNotMatch(controller, /this\.cards\.create\(parent, Number\(hand\[index\]\), false, select\)/);
});

test('manual start and pass are fail-closed capabilities, and operation layout stays centered', () => {
  const controller = readFileSync(controllerPath, 'utf8');
  const runtime = readFileSync(join(clientRoot, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkRuntime.ts'), 'utf8');
  assert.match(runtime, /manualStart\?: \(\) => Promise<unknown>/);
  assert.match(runtime, /typeof this\.options\.manualStart === 'function'/);
  assert.match(controller, /this\.runtime\.supportsManualStart\(\)/);
  assert.match(controller, /ruleOptions\.allowPassByRoomRule === true/);
  assert.match(controller, /layout\.resizeMode = Layout\.ResizeMode\.NONE/);
  assert.match(controller, /container\.setSiblingIndex\(container\.parent\.children\.length - 1\)/);
  assert.match(controller, /layout\.paddingLeft = sidePadding/);

  const serialized = JSON.parse(readFileSync(prefabPath, 'utf8'));
  const buttonContainerIndex = serialized.findIndex((item) => item?.__type__ === 'cc.Node' && item._name === 'TurnActions');
  const buttonContainer = serialized[buttonContainerIndex];
  const transform = buttonContainer._components.map((item) => serialized[item.__id__])
    .find((item) => item?.__type__ === 'cc.UITransform');
  const layout = buttonContainer._components.map((item) => serialized[item.__id__])
    .find((item) => item?.__type__ === 'cc.Layout');
  assert.equal(transform._contentSize.width, 900);
  assert.equal(transform._anchorPoint.x, 0.5);
  assert.equal(layout._resizeMode, 0);
  assert.equal(layout._spacingX, 50);
  assert.equal(layout._affectedByScale, true);
});
