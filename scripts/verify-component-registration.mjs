import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const assetsRoot = path.join(root, 'assets');
const errors = [];
const files = [];

function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            // User-private manual backup. It is not a runtime asset tree and must not be
            // imported, validated, or used as a duplicate-UUID source.
            if (path.relative(assetsRoot, file) === 'Lobby/Prefab/uiGame-001') continue;
            walk(file);
        }
        else files.push(file);
    }
}

function relative(file) { return path.relative(root, file); }
function fail(file, message) { errors.push(`${relative(file)}: ${message}`); }

walk(assetsRoot);

const classOwners = new Map();
for (const file of files.filter(candidate => candidate.endsWith('.ts'))) {
    const source = fs.readFileSync(file, 'utf8');
    const decorators = [...source.matchAll(/@ccclass\s*\(\s*(['"])([^'"]+)\1\s*\)/g)];
    const componentClasses = [...source.matchAll(/(?:export\s+default\s+|export\s+)?class\s+[$\w]+\s+extends\s+(?:[$\w]+\.)?Component\b/g)];
    const declaredClasses = [...source.matchAll(/(?:export\s+default\s+|export\s+)?class\s+[$\w]+\b/g)];
    if (componentClasses.length > 1) fail(file, `declares ${componentClasses.length} Component subclasses; maximum is one`);
    if (decorators.length > 1) fail(file, `declares ${decorators.length} @ccclass registrations; maximum is one`);
    if (componentClasses.length > 0 && componentClasses.length !== decorators.length) fail(file, `Component/@ccclass mismatch (${componentClasses.length}/${decorators.length}); decorator target may be empty or unregistered`);
    if (componentClasses.length === 0 && decorators.length > declaredClasses.length) fail(file, 'serializable @ccclass has no declared class target');
    if (/export\s+default\s+class\s+[$\w]+\s+extends\s+(?:[$\w]+\.)?Component\b/.test(source)) fail(file, 'Component must use a named export, not default export');
    for (const match of decorators) {
        const name = match[2];
        const owners = classOwners.get(name) ?? [];
        owners.push(relative(file));
        classOwners.set(name, owners);
    }
    if (!fs.existsSync(`${file}.meta`)) fail(file, 'script is missing its .meta file');
}

for (const [name, owners] of classOwners) {
    if (owners.length > 1) errors.push(`duplicate @ccclass '${name}': ${owners.join(', ')}`);
}

const uuidOwners = new Map();
const legacyReferenceUuids = new Set();
function registerUuid(uuid, owner) {
    const owners = uuidOwners.get(uuid) ?? [];
    if (!owners.includes(owner)) owners.push(owner);
    uuidOwners.set(uuid, owners);
}

for (const file of files.filter(candidate => candidate.endsWith('.meta'))) {
    let meta;
    try { meta = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { fail(file, `invalid meta JSON: ${error.message}`); continue; }
    const owner = relative(file);
    if (typeof meta.uuid === 'string') registerUuid(meta.uuid, owner);
    for (const value of Object.values(meta.subMetas ?? {})) {
        if (typeof value?.uuid === 'string') registerUuid(value.uuid, owner);
        // 旧版 Creator SpriteFrame 会以 rawTextureUuid@f9941 写入场景/预制体。
        // 当前项目保留这些 UUID 作为历史引用桥，门禁必须识别它们，
        // 否则会误判仍可被 Creator 解析的权威图片资源为 missing UUID。
        // rawTextureUuid 可能被 plist/png 同源 meta 共用，只用于可解析性，不参与重复 UUID 判定。
        if (typeof value?.rawTextureUuid === 'string') legacyReferenceUuids.add(value.rawTextureUuid);
    }
}

for (const [uuid, owners] of uuidOwners) {
    if (owners.length > 1) errors.push(`duplicate UUID '${uuid}': ${owners.join(', ')}`);
}

// Creator's built-in 2D sprite/label materials are valid without project .meta files.
const builtinUuids = new Set([
    'eca5d2f2-8ef6-41c2-bbe6-f9c79d09c432',
    '3a7bb79f-32fd-422e-ada2-96f518fed422',
]);

for (const file of files.filter(candidate => /\.(scene|prefab)$/.test(candidate))) {
    let records;
    try { records = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { fail(file, `invalid serialized JSON: ${error.message}`); continue; }
    if (!Array.isArray(records)) { fail(file, 'serialized asset root must be an array'); continue; }

    const inspectUuidReferences = (value, location) => {
        if (!value || typeof value !== 'object') return;
        if (typeof value.__uuid__ === 'string') {
            const uuid = value.__uuid__.split('@')[0];
            if (!uuidOwners.has(uuid) && !legacyReferenceUuids.has(uuid) && !builtinUuids.has(uuid)) fail(file, `${location} references missing UUID ${uuid}`);
        }
        for (const [key, child] of Object.entries(value)) inspectUuidReferences(child, `${location}.${key}`);
    };
    inspectUuidReferences(records, 'records');

    for (const [index, record] of records.entries()) {
        if (record?.__type__ !== 'cc.Node' || !Array.isArray(record._components)) continue;
        const byType = new Map();
        for (const componentReference of record._components) {
            const id = componentReference?.__id__;
            if (!Number.isInteger(id) || !records[id]) { fail(file, `node ${index} (${record._name ?? ''}) has missing component reference ${id}`); continue; }
            const component = records[id];
            if (typeof component.__type__ !== 'string') { fail(file, `component ${id} has an empty decorator/type target`); continue; }
            if (component.__type__.startsWith('cc.')) {
                const ids = byType.get(component.__type__) ?? [];
                ids.push(id);
                byType.set(component.__type__, ids);
            }
            if (component.__type__ === 'cc.AudioSource') {
                const clip = component._clip ?? component.clip ?? null;
                const playOnAwake = component._playOnAwake ?? component.playOnAwake ?? false;
                if (playOnAwake && !clip) fail(file, `node ${index} (${record._name ?? ''}) has AudioSource Play On Awake with an empty clip`);
            }
        }
        for (const [type, ids] of byType) {
            if (ids.length > 1) fail(file, `node ${index} (${record._name ?? ''}) has duplicate native ${type} components: ${ids.join(', ')}`);
        }
    }
}

if (errors.length) {
    console.error(`Component registration gate failed (${errors.length}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
}

console.log(`Component registration gate passed: ${classOwners.size} ccclass names, ${uuidOwners.size} UUIDs.`);
