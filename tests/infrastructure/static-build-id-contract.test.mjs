import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = async relative => readFile(new URL(`../../${relative}`, import.meta.url), 'utf8');
const [pkg, installer, supervisor, manager, proxy] = await Promise.all([
    read('package.json'),
    read('scripts/install-preview-snapshot-launchagent.mjs'),
    read('scripts/preview-snapshot-supervisor.mjs'),
    read('scripts/preview-snapshot-manager.mjs'),
    read('scripts/lan-preview-proxy.mjs'),
]);

test('current preview entry uses only the immutable snapshot supervisor chain', () => {
    assert.match(pkg, /"preview:snapshot:supervisor":\s*"node scripts\/preview-snapshot-supervisor\.mjs"/);
    assert.match(installer, /resolve\('scripts\/preview-snapshot-supervisor\.mjs'\)/);
    assert.doesNotMatch(installer, /resolve\('scripts\/static-build-supervisor\.mjs'\)/);
    assert.doesNotMatch(pkg, /static-build-(?:supervisor|server)/);
});

test('snapshot build identity is immutable and shared by every fixed client port', () => {
    assert.match(supervisor, /A:7462,B:7459,C:5188,D:7461/);
    assert.match(manager, /const snapshotValidationRevision = '[^']+'/);
    assert.match(manager, /const buildId = digest\.digest\('hex'\)\.slice\(0, 20\)/);
    assert.match(proxy, /\/__aoo\/build\/\$\{buildId\}/);
    assert.match(proxy, /const manifest = JSON\.parse\(readFileSync\(manifestPath, 'utf8'\)\)/);
    assert.match(proxy, /entriesByKey: new Map\(manifest\.entries\.map/);
});

test('stale snapshots fail closed before serving an old build', () => {
    assert.match(proxy, /status: 'STALE'/);
    assert.match(proxy, /PREVIEW_SNAPSHOT_STALE/);
    assert.match(proxy, /sendJson\(response, 503/);
    assert.match(supervisor, /markStale\(\{ reason: 'upstream-unavailable'/);
    assert.match(supervisor, /retainedPreviousSnapshot: false/);
});
