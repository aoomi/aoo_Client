import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const serverSource = await readFile(new URL('../../scripts/static-build-server.mjs', import.meta.url), 'utf8');

function declaredFingerprintFiles(source) {
  const block = source.match(/const BUILD_ID_FILES = \[([\s\S]*?)\n\];/)?.[1];
  assert.ok(block, 'static server must declare its build fingerprint inputs');
  return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function fingerprint(files, contents) {
  const digest = createHash('sha256');
  for (const file of files) digest.update(contents.get(file) ?? file);
  return digest.digest('hex').slice(0, 20);
}

test('fixed-port buildId covers shared UI and PDK business bundles', () => {
  const files = declaredFingerprintFiles(serverSource);
  assert.ok(files.includes('assets/common/index.js'));
  assert.ok(files.includes('assets/paodekuai-common/index.js'));
  assert.equal(new Set(files).size, files.length, 'fingerprint inputs must be unique');
});

test('PDK bundle content changes the deterministic buildId', () => {
  const files = declaredFingerprintFiles(serverSource);
  const baseline = new Map(files.map((file) => [file, `content:${file}`]));
  const unchanged = new Map(baseline);
  const changed = new Map(baseline);
  changed.set('assets/paodekuai-common/index.js', 'content:PDK-changed');

  assert.equal(fingerprint(files, baseline), fingerprint(files, unchanged));
  assert.notEqual(fingerprint(files, baseline), fingerprint(files, changed));
});
