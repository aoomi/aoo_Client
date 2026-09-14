import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assetsRoot = path.join(clientRoot, 'assets');
const modulesRoot = path.join(assetsRoot, 'Modules');
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.plist']);

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

function buildUuidIndex() {
    const index = new Map();
    for (const metaPath of walk(assetsRoot).filter(file => file.endsWith('.meta'))) {
        const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        const assetPath = metaPath.slice(0, -5);
        for (const uuid of collectUuidValues(metadata)) index.set(uuid, assetPath);
    }
    return index;
}

test('every image referenced by a module prefab is stored in its module Atlas or Common Atlas', () => {
    const uuidIndex = buildUuidIndex();
    const violations = [];
    let checkedReferences = 0;

    for (const moduleEntry of fs.readdirSync(modulesRoot, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
        const moduleRoot = path.join(modulesRoot, moduleEntry.name);
        const atlasRoot = `${path.join(moduleRoot, 'Atlas')}${path.sep}`;
        const commonAtlasRoot = `${path.join(assetsRoot, 'Common', 'Atlas')}${path.sep}`;
        for (const prefabPath of walk(moduleRoot).filter(file => file.endsWith('.prefab'))) {
            const prefabSource = fs.readFileSync(prefabPath, 'utf8');
            for (const match of prefabSource.matchAll(/"__uuid__"\s*:\s*"([^"]+)"/g)) {
                const assetPath = uuidIndex.get(match[1]);
                if (!assetPath || !imageExtensions.has(path.extname(assetPath).toLowerCase())) continue;
                checkedReferences += 1;
                if (!assetPath.startsWith(atlasRoot) && !assetPath.startsWith(commonAtlasRoot)) {
                    violations.push(`${path.relative(clientRoot, prefabPath)} -> ${path.relative(clientRoot, assetPath)}`);
                }
            }
        }
    }

    assert.ok(checkedReferences > 0, 'expected module prefabs to contain image references');
    assert.deepEqual(violations, []);
});

test('module Atlas has no legacy Imported hierarchy', () => {
    const imported = fs.readdirSync(modulesRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && fs.existsSync(path.join(modulesRoot, entry.name, 'Atlas', 'Imported')))
        .map(entry => entry.name);
    assert.deepEqual(imported, []);
});
