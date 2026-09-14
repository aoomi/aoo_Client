import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { LAYOUT_TYPE, expectedGeometry } from './editbox-label-layout-lib.mjs';

const write = process.argv.includes('--write');
const fileArgumentIndex = process.argv.indexOf('--file');
const explicitFile = fileArgumentIndex >= 0 ? process.argv[fileArgumentIndex + 1] : null;
if (fileArgumentIndex >= 0 && (!explicitFile || explicitFile.startsWith('--'))) {
  throw new Error('--file requires a scene or prefab path');
}
const files = explicitFile ? [explicitFile] : execFileSync('rg', ['-l', 'cc\\.EditBox', 'assets', '-g', '*.scene', '-g', '*.prefab'], { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean).sort();
const issues = [];
let editBoxCount = 0;
let changedFileCount = 0;

function component (objects, node, type) {
  return (node?._components ?? []).map((reference) => objects[reference.__id__]).find((entry) => entry?.__type__ === type);
}

function labelForChild (objects, node, name) {
  const child = (node?._children ?? []).map((reference) => objects[reference.__id__]).find((entry) => entry?._name === name);
  return component(objects, child, 'cc.Label');
}

function near (a, b) {
  return Number.isFinite(a) && Math.abs(a - b) < 1e-4;
}

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const objects = JSON.parse(source);
  let changed = false;
  for (const editBox of objects.filter((entry) => entry?.__type__ === 'cc.EditBox')) {
    editBoxCount += 1;
    const node = objects[editBox.node?.__id__];
    const owner = component(objects, node, 'cc.UITransform');
    if (!node || !owner) {
      issues.push(`${file}: EditBox node/UITransform missing`);
      continue;
    }

    const backgroundNode = (node._children ?? []).map((reference) => objects[reference.__id__])
      .find((entry) => entry?._name === 'BACKGROUND_SPRITE');
    const background = component(objects, backgroundNode, 'cc.UITransform');
    const rootSprite = component(objects, node, 'cc.Sprite');
    if (rootSprite && backgroundNode) {
      const filtered = backgroundNode._components.filter((reference) => objects[reference.__id__]?.__type__ !== 'cc.Sprite');
      if (filtered.length !== backgroundNode._components.length) {
        backgroundNode._components = filtered;
        changed = true;
      }
    }
    if (background && (!near(owner._contentSize?.width, background._contentSize?.width)
      || !near(owner._contentSize?.height, background._contentSize?.height))) {
      owner._contentSize = { __type__: 'cc.Size', width: background._contentSize.width, height: background._contentSize.height };
      changed = true;
    }

    for (const [field, childName] of [['_textLabel', 'TEXT_LABEL'], ['_placeholderLabel', 'PLACEHOLDER_LABEL']]) {
      if (!editBox[field]?.__id__ || objects[editBox[field].__id__]?.__type__ !== 'cc.Label') {
        const label = labelForChild(objects, node, childName);
        const labelId = objects.indexOf(label);
        if (labelId < 0) {
          issues.push(`${file}: ${node._name}/${childName} label binding missing`);
          continue;
        }
        editBox[field] = { __id__: labelId };
        changed = true;
      }
    }

    const labels = [objects[editBox._textLabel?.__id__], objects[editBox._placeholderLabel?.__id__]];
    if (labels.some((label) => !label)) continue;
    const textAlign = labels[0]._horizontalAlign ?? 0;
    const placeholderAlign = labels[1]._horizontalAlign ?? 0;
    const padding = { left: 2, right: 0, top: 0, bottom: 0 };
    const geometry = expectedGeometry({
      width: owner._contentSize.width,
      height: owner._contentSize.height,
      anchorX: owner._anchorPoint.x,
      anchorY: owner._anchorPoint.y,
    }, padding);

    for (const label of labels) {
      const labelNode = objects[label.node?.__id__];
      const transform = component(objects, labelNode, 'cc.UITransform');
      if (!labelNode || !transform) {
        issues.push(`${file}: ${node._name} label node/UITransform missing`);
        continue;
      }
      const valid = transform._anchorPoint?.x === 0 && transform._anchorPoint?.y === 1
        && near(labelNode._lpos?.x, geometry.position.x) && near(labelNode._lpos?.y, geometry.position.y)
        && near(transform._contentSize?.width, geometry.size.width) && near(transform._contentSize?.height, geometry.size.height)
        && label._horizontalAlign === (label === labels[0] ? textAlign : placeholderAlign)
        && label._verticalAlign === 1 && label._overflow === 1
        && label._srcBlendFactor === 1 && label._dstBlendFactor === 4;
      if (!valid) changed = true;
      transform._anchorPoint = { __type__: 'cc.Vec2', ...geometry.anchor };
      transform._contentSize = { __type__: 'cc.Size', ...geometry.size };
      labelNode._lpos = { __type__: 'cc.Vec3', ...geometry.position, z: labelNode._lpos?.z ?? 0 };
      label._verticalAlign = 1;
      label._overflow = 1;
      label._srcBlendFactor = 1;
      label._dstBlendFactor = 4;
    }

    let layout = component(objects, node, LAYOUT_TYPE);
    if (!layout) {
      layout = {
        __type__: LAYOUT_TYPE, _name: '', _objFlags: 0, __editorExtras__: {},
        node: { __id__: objects.indexOf(node) }, _enabled: true, __prefab: null,
        left: 2, right: 0, top: 0, bottom: 0,
        textHorizontalAlign: textAlign, placeholderHorizontalAlign: placeholderAlign, verticalAlign: 1,
        _id: '',
      };
      objects.push(layout);
      node._components.push({ __id__: objects.length - 1 });
      changed = true;
    } else {
      const validLayout = layout.left === 2 && layout.right === 0 && layout.top === 0 && layout.bottom === 0
        && layout.textHorizontalAlign === textAlign && layout.placeholderHorizontalAlign === placeholderAlign
        && layout.verticalAlign === 1;
      if (!validLayout) changed = true;
      Object.assign(layout, {
        left: 2, right: 0, top: 0, bottom: 0,
        textHorizontalAlign: textAlign, placeholderHorizontalAlign: placeholderAlign, verticalAlign: 1,
      });
    }
  }

  if (changed) {
    changedFileCount += 1;
    if (write) fs.writeFileSync(file, `${JSON.stringify(objects, null, 2)}\n`);
    else issues.push(`${file}: layout is not normalized`);
  }
}

if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`EditBox label layout OK: ${editBoxCount} EditBoxes in ${files.length} assets (${changedFileCount} changed).`);
}
