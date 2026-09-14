import { cpSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const clientRoot = resolve(import.meta.dirname, '..');
const prefabRoot = resolve(clientRoot, 'assets/Common/Prefab/Common');
const targetName = 'Message';
const templateNames = ['MessageGps', 'MessageJoin', 'MessageLostConnect', 'MessageTip', 'MessageUpdate'];
const targetPath = resolve(prefabRoot, `${targetName}.prefab`);
const targetMetaPath = `${targetPath}.meta`;

function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function replaceObjectIds(value, ids) {
    if (Array.isArray(value)) {
        value.forEach((item) => replaceObjectIds(item, ids));
        return;
    }
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, '__id__') && ids.has(value.__id__)) value.__id__ = ids.get(value.__id__);
    for (const child of Object.values(value)) replaceObjectIds(child, ids);
}

function validatePrefab(objects, expectedTemplates) {
    const validIds = new Set(objects.map((_, index) => index));
    const visit = (value) => {
        if (Array.isArray(value)) return value.forEach(visit);
        if (!value || typeof value !== 'object') return;
        if (Object.hasOwn(value, '__id__') && !validIds.has(value.__id__)) {
            throw new Error(`Dangling object reference: ${value.__id__}`);
        }
        for (const child of Object.values(value)) visit(child);
    };
    objects.forEach(visit);
    const root = objects[1];
    const templateRootId = root._children.find(({ __id__ }) => objects[__id__]?._name === 'MessageTemplates')?.__id__;
    if (templateRootId === undefined) throw new Error('MessageTemplates root is missing');
    const templateRoot = objects[templateRootId];
    for (const name of expectedTemplates) {
        if (!templateRoot._children.some(({ __id__ }) => objects[__id__]?._name === `Template_${name}`)) {
            throw new Error(`Missing merged template: ${name}`);
        }
    }
}

const target = readJson(targetPath);
const targetMeta = readJson(targetMetaPath);
const backupRoot = resolve('/tmp', `aoo-message-prefab-backup-${Date.now()}`);
mkdirSync(backupRoot, { recursive: true });
for (const name of [targetName, ...templateNames]) {
    cpSync(resolve(prefabRoot, `${name}.prefab`), resolve(backupRoot, `${name}.prefab`));
    cpSync(resolve(prefabRoot, `${name}.prefab.meta`), resolve(backupRoot, `${name}.prefab.meta`));
}

const messageRoot = target[1];
const templateRootId = target.length;
const templateTransformId = templateRootId + 1;
const templatePrefabInfoId = templateRootId + 2;
target.push({
    __type__: 'cc.Node', _name: 'MessageTemplates', _objFlags: 0, _parent: { __id__: 1 }, _children: [], _active: false,
    _components: [{ __id__: templateTransformId }], _prefab: { __id__: templatePrefabInfoId }, _opacity: 255,
    _color: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
    _contentSize: { __type__: 'cc.Size', width: 0, height: 0 }, _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 },
    _trs: { __type__: 'TypedArray', ctor: 'Float64Array', array: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1] },
    _eulerAngles: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 }, _skewX: 0, _skewY: 0, _is3DNode: false, _groupIndex: 0,
    groupIndex: 0, _id: '', _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 }, _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
    _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 }, _mobility: 0, _layer: 33554432, _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
});
target.push({ __type__: 'cc.UITransform', _name: '', _objFlags: 0, node: { __id__: templateRootId }, _enabled: true, __prefab: null, _contentSize: { __type__: 'cc.Size', width: 0, height: 0 }, _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 }, _id: '' });
target.push({ __type__: 'cc.PrefabInfo', root: { __id__: 1 }, asset: { __uuid__: targetMeta.uuid }, fileId: 'MessageTemplatesRoot', sync: false });
messageRoot._children.push({ __id__: templateRootId });

for (const name of templateNames) {
    const source = readJson(resolve(prefabRoot, `${name}.prefab`));
    const ids = new Map();
    for (let oldId = 1; oldId < source.length; oldId += 1) ids.set(oldId, target.length + oldId - 1);
    const merged = source.slice(1).map(clone);
    merged.forEach((object) => replaceObjectIds(object, ids));
    const sourceRoot = merged[0];
    sourceRoot._name = `Template_${name}`;
    sourceRoot._parent = { __id__: templateRootId };
    sourceRoot._active = true;
    for (const object of merged) {
        if (object?.__type__ === 'cc.PrefabInfo') {
            object.root = { __id__: 1 };
            object.asset = { __uuid__: targetMeta.uuid };
        }
    }
    target[templateRootId]._children.push({ __id__: ids.get(1) });
    target.push(...merged);
}

validatePrefab(target, templateNames);
const temporaryPath = `${targetPath}.migration.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(target, null, 2)}\n`);
renameSync(temporaryPath, targetPath);
console.log(JSON.stringify({ target: basename(targetPath), backupRoot, objects: target.length, templates: templateNames }, null, 2));
