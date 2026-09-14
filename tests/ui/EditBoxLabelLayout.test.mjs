import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { expectedGeometry, LAYOUT_TYPE } from '../../scripts/editbox-label-layout-lib.mjs';

function component (objects, node, type) {
  return (node?._components ?? []).map(({ __id__ }) => objects[__id__]).find((entry) => entry?.__type__ === type);
}

test('computes Creator top-left label geometry with asymmetric padding', () => {
  assert.deepEqual(expectedGeometry(
    { width: 337, height: 75, anchorX: 0.5, anchorY: 0.5 },
    { left: 12, right: 8, top: 4, bottom: 6 },
  ), {
    anchor: { x: 0, y: 1 },
    position: { x: -156.5, y: 33.5 },
    size: { width: 317, height: 65 },
  });
});

test('runtime component is event-driven and contains no frame or delayed overwrite', () => {
  const source = fs.readFileSync('assets/Common/Code/UI/EditBoxLabelLayout.ts', 'utf8');
  assert.match(source, /Node\.EventType\.SIZE_CHANGED/);
  assert.doesNotMatch(source, /\bupdate\s*\(/);
  assert.doesNotMatch(source, /schedule|setTimeout|setInterval/);
  assert.doesNotMatch(source, /as any|_updateLabelPosition|prototype/);
  const normalizer = fs.readFileSync('scripts/normalize-editbox-label-layout.mjs', 'utf8');
  assert.doesNotMatch(normalizer, /label\._color|label\._font\b/, 'normalizer must preserve authored color and font');
});

test('LoginScene account and password labels remain inside their EditBox after deserialization', () => {
  const objects = JSON.parse(fs.readFileSync('assets/Login/Scenes/LoginScene.scene', 'utf8'));
  const backgroundFrame = 'edd215b9-2796-4a05-aaf5-81f96c9281ce@f9941';
  for (const name of ['AccountInput', 'PasswordInput']) {
    const node = objects.find((entry) => entry?.__type__ === 'cc.Node' && entry._name === name);
    const owner = component(objects, node, 'cc.UITransform');
    const editBox = component(objects, node, 'cc.EditBox');
    const layout = component(objects, node, LAYOUT_TYPE);
    assert.ok(owner && editBox && layout, `${name} must bind EditBoxLabelLayout`);
    assert.equal(editBox._backgroundImage?.__uuid__, backgroundFrame, `${name} must bind the stable gray background`);
    const rootSprite = component(objects, node, 'cc.Sprite');
    assert.equal(rootSprite?._spriteFrame?.__uuid__, backgroundFrame, `${name} native root Sprite must use the stable gray background`);
    const backgroundNode = (node._children ?? []).map(({ __id__ }) => objects[__id__]).find((entry) => entry?._name === 'InputBackground');
    const backgroundTransform = component(objects, backgroundNode, 'cc.UITransform');
    const backgroundSprite = component(objects, backgroundNode, 'cc.Sprite');
    assert.deepEqual(owner._contentSize, backgroundTransform._contentSize, `${name} input hit area must match its visible background`);
    assert.equal(backgroundSprite, undefined, `${name} legacy background child must not duplicate the native root Sprite`);
    for (const field of ['_textLabel', '_placeholderLabel']) {
      const label = objects[editBox[field].__id__];
      const labelNode = objects[label.node.__id__];
      const transform = component(objects, labelNode, 'cc.UITransform');
      const left = labelNode._lpos.x;
      const right = left + transform._contentSize.width;
      const bottom = labelNode._lpos.y - transform._contentSize.height;
      const top = labelNode._lpos.y;
      assert.deepEqual(transform._anchorPoint, { __type__: 'cc.Vec2', x: 0, y: 1 });
      assert.ok(left >= -owner._contentSize.width / 2 && right <= owner._contentSize.width / 2 + 1e-4, `${name}/${field} horizontal bounds`);
      assert.ok(bottom >= -owner._contentSize.height / 2 && top <= owner._contentSize.height / 2 + 1e-4, `${name}/${field} vertical bounds`);
      assert.equal(label._verticalAlign, 1);
      assert.equal(label._overflow, 1);
      const color = label._color;
      assert.ok(color && Math.max(color.r, color.g, color.b) <= 64 && color.a === 255, `${name}/${field} must contrast with gray background`);
    }
  }
});
