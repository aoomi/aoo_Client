import fs from 'node:fs';

const scenePath = new URL('../assets/Login/Scenes/LoginScene.scene', import.meta.url);
const serialized = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
const removed = new Set();

for (let index = 0; index < serialized.length; index += 1) {
    const component = serialized[index];
    if (component?.__type__ !== 'cc.LabelOutline') continue;

    const node = serialized[component.node?.__id__];
    if (!node || !Array.isArray(node._components)) {
        throw new Error(`LabelOutline ${index} has no valid owner node`);
    }

    const labelRef = node._components.find(({ __id__ }) => serialized[__id__]?.__type__ === 'cc.Label');
    const label = labelRef && serialized[labelRef.__id__];
    if (!label) throw new Error(`LabelOutline ${index} on ${node._name} has no Label`);

    // Creator 3.8 stores the visual values on Label. A legacy LabelOutline's
    // presence means outlining was enabled, even when the old component did not
    // serialize its deprecated width/color fields.
    label._enableOutline = component._enabled !== false;
    label._outlineWidth = component._width ?? label._outlineWidth ?? 2;
    label._outlineColor = component._color ?? label._outlineColor ?? {
        __type__: 'cc.Color', r: 0, g: 0, b: 0, a: 255,
    };
    node._components = node._components.filter(({ __id__ }) => __id__ !== index);
    removed.add(index);
}

if (removed.size === 0) process.exit(0);

const remap = new Map();
let next = 0;
for (let old = 0; old < serialized.length; old += 1) {
    if (!removed.has(old)) remap.set(old, next++);
}

const rewritten = JSON.parse(JSON.stringify(
    serialized.filter((_, index) => !removed.has(index)),
    (key, value) => {
        if (key !== '__id__') return value;
        if (!remap.has(value)) throw new Error(`Dangling reference to removed object ${value}`);
        return remap.get(value);
    },
));

fs.writeFileSync(scenePath, `${JSON.stringify(rewritten, null, 2)}\n`);
console.log(`Migrated ${removed.size} LabelOutline components to cc.Label outline properties.`);
