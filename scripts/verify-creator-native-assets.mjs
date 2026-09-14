import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const assetsRoot = path.join(root, 'assets');
const failures = new Set();
const allFiles = [];
const serializedFiles = [];
const metaByUuid = new Map();

function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            // uiGame-001 is a user-private backup, deliberately outside Creator/runtime
            // validation. Never inspect its contents from project gates.
            if (path.relative(assetsRoot, file) === 'Lobby/Prefab/uiGame-001') continue;
            walk(file);
        }
        else allFiles.push(file);
    }
}

function rel(file) { return path.relative(root, file); }
function fail(file, message) { failures.add(`${rel(file)}: ${message}`); }
function visit(value, callback, location = '$') {
    if (!value || typeof value !== 'object') return;
    callback(value, location);
    if (Array.isArray(value)) value.forEach((child, index) => visit(child, callback, `${location}[${index}]`));
    else for (const [key, child] of Object.entries(value)) visit(child, callback, `${location}.${key}`);
}

walk(assetsRoot);

for (const file of allFiles) {
    if (!file.endsWith('.meta') && !fs.existsSync(`${file}.meta`)) fail(file, 'asset is missing its Creator .meta file');
    if (file.endsWith('.meta') && !fs.existsSync(file.slice(0, -5))) fail(file, 'orphan .meta has no asset');
    if (!file.endsWith('.meta')) continue;
    let meta;
    try { meta = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { fail(file, `invalid meta JSON: ${error.message}`); continue; }
    const entries = [meta, ...Object.values(meta.subMetas ?? {})];
    for (const entry of entries) {
        if (typeof entry?.uuid !== 'string' || entry.uuid.length === 0) continue;
        const owner = metaByUuid.get(entry.uuid);
        if (owner && owner !== file) fail(file, `UUID ${entry.uuid} is also owned by ${rel(owner)}`);
        else metaByUuid.set(entry.uuid, file);
    }
}

for (const file of allFiles.filter(candidate => /\.(scene|prefab)$/.test(candidate))) {
    let records;
    try { records = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { fail(file, `invalid serialized JSON: ${error.message}`); continue; }
    if (!Array.isArray(records) || records.length === 0) { fail(file, 'root must be a non-empty Creator object array'); continue; }
    serializedFiles.push({ file, records });

    visit(records, (value, location) => {
        if ('__id__' in value && (!Number.isInteger(value.__id__) || value.__id__ < 0 || value.__id__ >= records.length)) {
            fail(file, `${location} has dangling __id__ ${value.__id__}`);
        }
    });

    const nodes = new Map();
    for (const [index, record] of records.entries()) if (record?.__type__ === 'cc.Node') nodes.set(index, record);
    for (const [index, node] of nodes) {
        if (!Array.isArray(node._children)) fail(file, `node ${index} (${node._name ?? ''}) has no children array`);
        if (!Array.isArray(node._components)) fail(file, `node ${index} (${node._name ?? ''}) has no components array`);
        const children = (node._children ?? []).map(reference => reference?.__id__);
        if (new Set(children).size !== children.length) fail(file, `node ${index} (${node._name ?? ''}) repeats a child reference`);
        for (const childId of children) {
            const child = records[childId];
            if (child?.__type__ !== 'cc.Node') fail(file, `node ${index} (${node._name ?? ''}) child ${childId} is not a node`);
            else if (child._parent?.__id__ !== index) fail(file, `child ${childId} (${child._name ?? ''}) has an inconsistent parent`);
        }

        const componentIds = (node._components ?? []).map(reference => reference?.__id__);
        if (new Set(componentIds).size !== componentIds.length) fail(file, `node ${index} (${node._name ?? ''}) repeats a component reference`);
        const byType = new Map();
        for (const componentId of componentIds) {
            const component = records[componentId];
            if (!component || typeof component.__type__ !== 'string') { fail(file, `node ${index} (${node._name ?? ''}) component ${componentId} is not resolvable`); continue; }
            if (component.node?.__id__ !== index) fail(file, `component ${componentId} (${component.__type__}) has an inconsistent node reference`);
            const ids = byType.get(component.__type__) ?? [];
            ids.push(componentId);
            byType.set(component.__type__, ids);
        }
        for (const [type, ids] of byType) if (ids.length > 1) fail(file, `node ${index} (${node._name ?? ''}) duplicates ${type}: ${ids.join(', ')}`);

        const types = new Set([...byType.keys()]);
        if (node._active !== false && types.has('cc.BlockInputEvents')) {
            const opacityId = componentIds.find(id => ['cc.UIOpacity', 'cc.Opacity'].includes(records[id]?.__type__));
            const opacity = opacityId === undefined ? 255 : (records[opacityId]._opacity ?? records[opacityId].opacity ?? 255);
            if (opacity === 0) fail(file, `active invisible node ${index} (${node._name ?? ''}) blocks input`);
        }
    }

    const rootRecords = [...nodes].filter(([, node]) => node._parent == null);
    if (rootRecords.length !== 1) fail(file, `must contain exactly one root node, found ${rootRecords.length}`);

    // Follow parent links as well as child links so malformed cycles cannot hide in a detached branch.
    for (const [start] of nodes) {
        const seen = new Set();
        let current = start;
        while (nodes.has(current)) {
            if (seen.has(current)) { fail(file, `node parent cycle reaches ${current}`); break; }
            seen.add(current);
            current = nodes.get(current)._parent?.__id__;
        }
    }

    const numericArrays = [];
    visit(records, (value, location) => {
        if (Array.isArray(value) && value.length > 1_000_000 && value.every(item => typeof item === 'number')) numericArrays.push(`${location} (${value.length})`);
    });
    for (const item of numericArrays) fail(file, `oversized embedded mesh/index buffer ${item}`);
}

// Prefab dependency cycles are illegal even when every individual UUID resolves.
const prefabUuidToFile = new Map();
for (const { file } of serializedFiles.filter(item => item.file.endsWith('.prefab'))) {
    try {
        const uuid = JSON.parse(fs.readFileSync(`${file}.meta`, 'utf8')).uuid;
        if (typeof uuid === 'string') prefabUuidToFile.set(uuid, file);
    } catch { /* the meta error is already reported above */ }
}
const prefabEdges = new Map();
for (const { file, records } of serializedFiles.filter(item => item.file.endsWith('.prefab'))) {
    const edges = new Set();
    visit(records, value => {
        if (typeof value.__uuid__ !== 'string') return;
        const target = prefabUuidToFile.get(value.__uuid__.split('@')[0]);
        if (target) edges.add(target);
    });
    prefabEdges.set(file, edges);
}
const visiting = new Set();
const visited = new Set();
function inspectPrefab(file, stack) {
    if (visiting.has(file)) { fail(file, `prefab dependency cycle: ${[...stack, file].map(rel).join(' -> ')}`); return; }
    if (visited.has(file)) return;
    visiting.add(file);
    for (const target of prefabEdges.get(file) ?? []) inspectPrefab(target, [...stack, file]);
    visiting.delete(file);
    visited.add(file);
}
for (const file of prefabEdges.keys()) inspectPrefab(file, []);

if (failures.length) {
    console.error(`Creator native asset gate failed (${failures.size} blocking findings):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Creator native asset gate passed: ${serializedFiles.length} scenes/prefabs, ${allFiles.length} assets/meta files, ${metaByUuid.size} UUIDs, blocking=0.`);
