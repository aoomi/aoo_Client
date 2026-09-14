import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const assetsRoot = join(clientRoot, 'assets');
const canonicalPath = join(assetsRoot, 'Common/Font/mini_font_0.TTF');
const canonicalUuid = '5fe7041e-915d-421a-9256-da6799a335a7';
const retiredUuids = ['dfcef661-aa4d-4c64-9037-8a2d57820ab1', 'fd851aa2', 'c213eed0', 'b26653ae', 'aycpss45'];
const fontFiles = [];
const staleReferences = [];

function walk(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'uiGame-001') continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) walk(path);
    else {
      if (entry.name.toLowerCase() === 'mini_font_0.ttf') fontFiles.push(path);
      if (!entry.name.endsWith('.meta') && !/\.(prefab|scene|json|ts|js|mjs)$/.test(entry.name)) continue;
      const text = readFileSync(path, 'utf8');
      if (retiredUuids.some((uuid) => text.includes(uuid))) staleReferences.push(path);
    }
  }
}

walk(assetsRoot);
assert.deepEqual(fontFiles, [canonicalPath], 'mini_font_0.TTF must have one canonical copy');
assert.ok(existsSync(`${canonicalPath}.meta`), 'canonical font meta missing');
assert.equal(JSON.parse(readFileSync(`${canonicalPath}.meta`, 'utf8')).uuid, canonicalUuid, 'canonical font UUID changed');
assert.deepEqual(staleReferences, [], `retired font UUID references remain:\n${staleReferences.join('\n')}`);
console.log(JSON.stringify({ canonicalPath, canonicalUuid, duplicateCount: 0, staleReferenceCount: 0 }));
