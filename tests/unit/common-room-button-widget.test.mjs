import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const prefabPath = new URL('../../assets/Games/Common/Prefab/CommonRoom.prefab', import.meta.url);
const entries = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
const dereference = (value) => value && Number.isInteger(value.__id__) ? entries[value.__id__] : null;

function findNode(node, path) {
  if (!node || path.length === 0) return node;
  const child = (node._children ?? []).map(dereference).find((entry) => entry?._name === path[0]);
  return findNode(child, path.slice(1));
}

function widget(node) {
  return (node?._components ?? []).map(dereference).find((entry) => entry?.__type__ === 'cc.Widget');
}

const root = entries.find((entry) => entry?.__type__ === 'cc.Node' && entry._name === 'CommonRoom');
const buttons = findNode(root, ['Btn']);

test('CommonRoom keeps the 1280x720 authored coordinates and stretches to its runtime parent', () => {
  const transform = (root?._components ?? []).map(dereference).find((entry) => entry?.__type__ === 'cc.UITransform');
  const value = widget(root);
  assert.deepEqual([transform?._contentSize.width, transform?._contentSize.height], [1280, 720]);
  assert.equal(value?._alignFlags, 45);
  assert.deepEqual([value?._left, value?._right, value?._top, value?._bottom], [0, 0, 0, 0]);
});

test('CommonRoom button layer stretches to the complete authored canvas', () => {
  const value = widget(buttons);
  assert.equal(value?._alignFlags, 45);
  assert.deepEqual([value?._left, value?._right, value?._top, value?._bottom], [0, 0, 0, 0]);
  assert.equal(value?._alignMode, 2);
});

test('TableLayer supplies the 1600 landscape boundary while overlay layers follow Canvas', () => {
  const scenePath = new URL('../../assets/Games/Common/Scenes/GameRoom2D.scene', import.meta.url);
  const sceneEntries = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
  const sceneRef = (value) => value && Number.isInteger(value.__id__) ? sceneEntries[value.__id__] : null;

  for (const name of ['TableLayer', 'OperationLayer', 'PopupLayer']) {
    const node = sceneEntries.find((entry) => entry?.__type__ === 'cc.Node' && entry._name === name);
    const transform = (node?._components ?? []).map(sceneRef).find((entry) => entry?.__type__ === 'cc.UITransform');
    const value = (node?._components ?? []).map(sceneRef).find((entry) => entry?.__type__ === 'cc.Widget');
    if (name === 'TableLayer') {
      assert.deepEqual([transform?._contentSize.width, transform?._contentSize.height], [1600, 720]);
      assert.equal(value?._alignFlags, 21, name);
      assert.deepEqual([value?._horizontalCenter, value?._top, value?._bottom], [0, 0, 0], name);
    } else {
      assert.equal(value?._alignFlags, 45, name);
      assert.deepEqual([value?._left, value?._right, value?._top, value?._bottom], [0, 0, 0, 0], name);
    }
    assert.equal(value?._alignMode, 2, `${name} must update on window resize`);
  }
});

test('CommonRoom corner buttons are anchored to their authored screen edges', () => {
  const expectations = {
    Btn_Gps: [9, 127.013, 0, 32.807, 0],
    Btn_Back: [9, 43.413, 0, 26.807, 0],
    Btn_SmallSettlement: [9, 138.671, 0, 18.788, 0],
    Btn_Voice: [36, 0, 47.5, 0, 77.5],
    Btn_Chat: [36, 0, 49, 0, 178],
    Btn_More: [33, 265.5, 33, 32.5, 0],
    RealTimeRecord: [12, 66.964, 0, 0, 99.866],
    RubCard: [12, 166.964, 0, 0, 99.866],
  };

  for (const [name, expected] of Object.entries(expectations)) {
    const value = widget(findNode(buttons, [name]));
    assert.deepEqual(
      [value?._alignFlags, value?._left, value?._right, value?._top, value?._bottom],
      expected,
      name,
    );
    assert.equal(value?._alignMode, 2, `${name} must update on window resize`);
  }
});
