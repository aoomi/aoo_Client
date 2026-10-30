import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const clientRoot = new URL('../..', import.meta.url).pathname;
const prefabPath = join(clientRoot, 'assets/Games/Poker/PDK/Common/Prefab/PDK_CommonRoom.prefab');
const controllerPath = join(clientRoot, 'assets/Games/Poker/PDK/Common/Code/Runtime/PdkHandInputController.ts');
const coordinatorPath = join(clientRoot, 'assets/Games/Poker/PDK/Common/Code/Runtime/PdkPlayController.ts');

test('the full-width gesture receiver follows Hand_Cards height and centre', () => {
  const serialized = JSON.parse(readFileSync(prefabPath, 'utf8'));
  const controller = readFileSync(controllerPath, 'utf8').replaceAll('this.host.', 'this.');
  const nodeByName = (name) => serialized.find((item) => item?.__type__ === 'cc.Node' && item._name === name);
  const visual = nodeByName('Hand_Cards');
  const touch = nodeByName('Hand_TouchArea');
  assert.ok(visual && touch);
  assert.equal(serialized[visual._parent.__id__]._name, 'Card');
  assert.equal(serialized[touch._parent.__id__]._name, 'Card');
  assert.equal(visual._lpos.y, touch._lpos.y, 'authored surface and cards share the same baseline');

  assert.match(controller, /const visualHand = this\.view\?\.find\('Players\/Seat_0\/Card\/Hand_Cards'\)/);
  assert.match(controller, /const visualHeight = visualTransform\.height \* visualWorldScaleY \/ worldScaleY/);
  assert.match(controller, /hand\.setWorldPosition\(visualPosition\)/);
  assert.match(controller, /transform\.setContentSize\(visibleWidth, visualHeight\)/);
  assert.doesNotMatch(controller, /bottomSelectionHeight|size\.height \* 0\.5/);
});

test('gesture-band membership uses full visible width and only Hand_Cards vertical bounds', () => {
  const controller = readFileSync(controllerPath, 'utf8').replaceAll('this.host.', 'this.');
  const start = controller.indexOf('public isInsideHandGestureArea');
  const end = controller.indexOf('public isInteractiveRoomControlAtUi', start);
  const area = controller.slice(start, end);
  assert.match(area, /sample\.ui\.x < origin\.x \|\| sample\.ui\.x > origin\.x \+ size\.width/);
  assert.match(area, /this\.handCardsTransform/);
  assert.match(area, /transform\.convertToNodeSpaceAR\(new Vec3\(sample\.ui\.x, sample\.ui\.y, 0\)\)/);
  assert.match(area, /local\.y >= bottom && local\.y <= top/);
  assert.doesNotMatch(area, /sample\.index|nearest card|size\.height \* 0\.5/);
});

test('the hand receiver remains an input surface while card identity stays exact', () => {
  const controller = readFileSync(controllerPath, 'utf8').replaceAll('this.host.', 'this.');
  const coordinator = readFileSync(coordinatorPath, 'utf8');
  assert.match(coordinator, /bindGestureSurface\(this\.view\.find\('Players\/Seat_0\/Card\/Hand_TouchArea'\)\)/);
  assert.match(controller, /surface\.on\(Node\.EventType\.TOUCH_START, this\.onHandTouchStart/);
  assert.match(controller, /surface\.on\(Node\.EventType\.MOUSE_DOWN, this\.onHandMouseDown/);
  assert.match(controller, /UITransform\.prototype\.hitTest\.call\(transform, screenPoint, windowId\)/);
});
