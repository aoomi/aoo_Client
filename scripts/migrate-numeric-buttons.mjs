import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prefabRoot = path.join(clientRoot, 'assets');
const numericName = /(?:pid|page|percent|sports|prize|score|cost|point|password|active|value|joinGame|leave|panker|diamond|choushui|PL(?:EditBox|Double|Start)|AutoDissolve)/i;
const explicitNumeric = new Set([
    'ClubPromoterAdd/EditBox', 'ForbidAddUser/EditBox', 'ForbidGameAddUser/EditBox',
    'ClubPromoterLevelAdd/EditBox', 'PromoterXIaShuAdd/EditBox', 'PromoterXiaShuList/EditBox',
    'UnionYaoQing/EditBox', 'YaoQing/EditBox',
]);

const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : entry.name.endsWith('.prefab') ? [target] : [];
});

const button = nodeId => ({
    __type__: 'cc.Button', _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: nodeId },
    _enabled: true, __prefab: null, clickEvents: [], _interactable: true, _transition: 0,
    _normalColor: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
    _hoverColor: { __type__: 'cc.Color', r: 211, g: 211, b: 211, a: 255 },
    _pressedColor: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
    _disabledColor: { __type__: 'cc.Color', r: 124, g: 124, b: 124, a: 255 },
    _normalSprite: null, _hoverSprite: null, _pressedSprite: null, _disabledSprite: null,
    _duration: 0.1, _zoomScale: 1.05, _target: null, _id: '',
});

let changedFiles = 0;
let migratedFields = 0;
for (const file of walk(prefabRoot)) {
    const objects = JSON.parse(fs.readFileSync(file, 'utf8'));
    const root = objects.find(value => value?.__type__ === 'cc.Node' && value._parent === null)?._name ?? '';
    let changed = false;
    for (const edit of objects) {
        if (edit?.__type__ !== 'cc.EditBox') continue;
        const nodeId = edit.node?.__id__;
        const node = Number.isInteger(nodeId) ? objects[nodeId] : null;
        if (!node || (edit._inputMode !== 2 && edit._inputMode !== 3 && edit._inputMode !== 5
            && !numericName.test(node._name ?? '') && !explicitNumeric.has(`${root}/${node._name ?? ''}`))) continue;
        const hasButton = (node._components ?? []).some(reference => objects[reference.__id__]?.__type__ === 'cc.Button');
        if (!hasButton) {
            node._components.push({ __id__: objects.length });
            objects.push(button(nodeId));
            changed = true;
        }
        const labelComponentId = edit._textLabel?.__id__ ?? edit._N$textLabel?.__id__;
        const labelNodeId = Number.isInteger(labelComponentId) ? objects[labelComponentId]?.node?.__id__ : null;
        if (Number.isInteger(labelNodeId) && objects[labelNodeId]?._name !== 'lb') {
            objects[labelNodeId]._name = 'lb';
            changed = true;
        }
        if (edit._enabled !== false) {
            edit._enabled = false;
            changed = true;
        }
        if (changed) migratedFields += 1;
    }
    if (!changed) continue;
    fs.writeFileSync(file, `${JSON.stringify(objects, null, 2)}\n`);
    changedFiles += 1;
}

console.log(JSON.stringify({ changedFiles, migratedFields }));
