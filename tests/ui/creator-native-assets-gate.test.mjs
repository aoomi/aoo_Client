import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('all scenes and prefabs satisfy the Creator 3.8.8 native asset gate', () => {
    const result = spawnSync(process.execPath, ['scripts/verify-creator-native-assets.mjs'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
