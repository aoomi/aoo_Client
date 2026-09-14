import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root,
    'assets/Common/Code/Runtime/CompatibilityApp/platform/LegacySubgameBundleService.ts'), 'utf8');

test('legacy subgame service releases only bundles it loaded and owns', () => {
    const releaseStart = source.indexOf('public release(name: string): void');
    const releaseEnd = source.indexOf('private normalize', releaseStart);
    assert.ok(releaseStart >= 0 && releaseEnd > releaseStart);
    const release = source.slice(releaseStart, releaseEnd);
    assert.match(release, /const bundle = this\.bundles\.get\(key\)/);
    assert.match(release, /if \(!bundle\) return/);
    assert.doesNotMatch(release, /assetManager\.getBundle/);
    assert.match(release, /bundle\.releaseAll\(\)/);
    assert.match(release, /assetManager\.removeBundle\(bundle\)/);
});
