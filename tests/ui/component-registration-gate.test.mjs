import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('all Creator components, UUIDs, and serialized native components pass registration gate', () => {
    const result = spawnSync(process.execPath, ['scripts/verify-component-registration.mjs'], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
