import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('empty-shell verification never traverses or cleans user-managed asset directories', () => {
    const source = readFileSync(path.join(clientRoot, 'scripts/verify-no-empty-asset-shells.mjs'), 'utf8');
    for (const family of ['CX', 'DDZ', 'GD', 'NN', 'PDK', 'SG', 'SJ', 'ZJH']) {
        assert.match(source, new RegExp(`userManagedDirectoryRoots[\\s\\S]*Games/Poker/${family}`));
    }
    assert.match(source, /if \(isUserManagedDirectory\(relativeDirectory\)\) return/);
    assert.match(source, /Lobby\/Prefab\/uiGame-001/);
    assert.doesNotMatch(source, /rmSync|unlinkSync|rmdirSync|renameSync/);
});
