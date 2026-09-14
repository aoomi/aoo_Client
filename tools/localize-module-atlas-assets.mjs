import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const clientRoot = path.resolve(import.meta.dirname, '..');
const assetsRoot = path.join(clientRoot, 'assets');
const modulesRoot = path.join(assetsRoot, 'Modules');
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.plist']);
const manifestPath = path.join(clientRoot, 'work', 'module-atlas-localization.json');

function walk(directory, output = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(target, output);
        else output.push(target);
    }
    return output;
}

function collectUuidValues(value, output = new Set()) {
    if (typeof value === 'string' && /^[0-9a-f-]{36}(?:@[0-9a-f]+)?$/i.test(value)) output.add(value);
    else if (Array.isArray(value)) value.forEach(item => collectUuidValues(item, output));
    else if (value && typeof value === 'object') Object.values(value).forEach(item => collectUuidValues(item, output));
    return output;
}

function replaceUuidValues(value, baseMap) {
    if (typeof value === 'string') {
        const [base, suffix] = value.split('@', 2);
        return baseMap.has(base) ? `${baseMap.get(base)}${suffix ? `@${suffix}` : ''}` : value;
    }
    if (Array.isArray(value)) return value.map(item => replaceUuidValues(item, baseMap));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceUuidValues(item, baseMap)]));
    }
    return value;
}

function ensureDirectoryMetadata(directory) {
    const visit = target => {
        const metaPath = `${target}.meta`;
        if (!fs.existsSync(metaPath)) {
            fs.writeFileSync(metaPath, `${JSON.stringify({
                ver: '1.2.0', importer: 'directory', imported: true,
                uuid: crypto.randomUUID(), files: [], subMetas: {}, userData: {},
            }, null, 2)}\n`);
        }
        for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
            if (entry.isDirectory()) visit(path.join(target, entry.name));
        }
    };
    visit(directory);
}

const files = walk(assetsRoot);
const uuidToAsset = new Map();
for (const metaPath of files.filter(file => file.endsWith('.meta'))) {
    try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        for (const uuid of collectUuidValues(meta)) uuidToAsset.set(uuid, metaPath.slice(0, -5));
    } catch { /* Creator will report malformed third-party metadata separately. */ }
}

let manifest = [];
if (fs.existsSync(manifestPath)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).assets ?? []; } catch { manifest = []; }
}
for (const moduleEntry of fs.readdirSync(modulesRoot, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    const moduleName = moduleEntry.name;
    const moduleRoot = path.join(modulesRoot, moduleName);
    const atlasRoot = path.join(moduleRoot, 'Atlas');
    const prefabs = walk(moduleRoot).filter(file => file.endsWith('.prefab'));
    const referencedAssets = new Set();
    for (const prefabPath of prefabs) {
        const source = fs.readFileSync(prefabPath, 'utf8');
        for (const match of source.matchAll(/"__uuid__"\s*:\s*"([^"]+)"/g)) {
            const asset = uuidToAsset.get(match[1]);
            if (asset && imageExtensions.has(path.extname(asset).toLowerCase()) && !asset.startsWith(`${atlasRoot}${path.sep}`)) {
                referencedAssets.add(asset);
            }
        }
    }

    const groups = [];
    for (const asset of referencedAssets) {
        const group = new Set([asset]);
        if (path.extname(asset).toLowerCase() === '.plist') {
            for (const extension of ['.png', '.jpg', '.jpeg', '.webp']) {
                const texture = asset.slice(0, -'.plist'.length) + extension;
                if (fs.existsSync(texture)) group.add(texture);
            }
        }
        groups.push(group);
    }

    const moduleUuidMap = new Map();
    for (const group of groups) {
        const metaObjects = [];
        for (const asset of group) {
            const metaPath = `${asset}.meta`;
            if (!fs.existsSync(metaPath)) throw new Error(`图片元数据缺失: ${metaPath}`);
            metaObjects.push([asset, JSON.parse(fs.readFileSync(metaPath, 'utf8'))]);
        }
        const baseMap = new Map();
        for (const [, meta] of metaObjects) {
            for (const uuid of collectUuidValues(meta)) {
                const base = uuid.split('@', 1)[0];
                if (!baseMap.has(base)) baseMap.set(base, crypto.randomUUID());
            }
        }
        for (const [oldBase, newBase] of baseMap) {
            moduleUuidMap.set(oldBase, newBase);
            for (const [uuid, sourceAsset] of uuidToAsset) {
                if (uuid === oldBase || uuid.startsWith(`${oldBase}@`)) {
                    const suffix = uuid.slice(oldBase.length);
                    moduleUuidMap.set(uuid, `${newBase}${suffix}`);
                    void sourceAsset;
                }
            }
        }
        for (const [asset, meta] of metaObjects) {
            const relative = path.relative(assetsRoot, asset);
            const extension = path.extname(asset);
            const basename = path.basename(asset, extension);
            let destination = path.join(atlasRoot, `${basename}${extension}`);
            if (fs.existsSync(destination)) {
                const collisionPrefix = crypto.createHash('sha1').update(relative).digest('hex').slice(0, 9);
                destination = path.join(atlasRoot, `${collisionPrefix}-${basename}${extension}`);
            }
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.copyFileSync(asset, destination);
            fs.writeFileSync(`${destination}.meta`, `${JSON.stringify(replaceUuidValues(meta, baseMap), null, 2)}\n`);
            manifest.push({ module: moduleName, source: path.relative(clientRoot, asset), destination: path.relative(clientRoot, destination) });
        }
    }

    for (const prefabPath of prefabs) {
        let source = fs.readFileSync(prefabPath, 'utf8');
        for (const [oldUuid, newUuid] of [...moduleUuidMap].sort((left, right) => right[0].length - left[0].length)) {
            source = source.split(`"${oldUuid}"`).join(`"${newUuid}"`);
        }
        fs.writeFileSync(prefabPath, source);
    }
}

fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
manifest = [...new Map(manifest.map(item => [`${item.module}:${item.destination}`, item])).values()];
fs.writeFileSync(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), assets: manifest }, null, 2)}\n`);
console.log(JSON.stringify({ copiedAssets: manifest.length, modules: [...new Set(manifest.map(item => item.module))], manifestPath }, null, 2));
