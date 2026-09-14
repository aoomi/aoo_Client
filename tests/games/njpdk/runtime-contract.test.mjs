import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../assets/Games/Poker/PDK/Common/Code/Runtime/', import.meta.url));
const commonRoot = fileURLToPath(new URL('../../../assets/Games/Poker/PDK/Common/Code/Runtime/', import.meta.url));
const walk = async (dir) => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(async (entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
}))).flat();
const files = [...await walk(root), ...await walk(commonRoot)].filter((path) => path.endsWith('.ts'));
const sources = await Promise.all(files.map(async (path) => [path, await readFile(path, 'utf8')]));
for (const [path, source] of sources) {
    assert.doesNotMatch(source, /CompatibilityApp\/njpdk\//, `${path} must not import the compatibility re-export`);
}
const all = sources.map(([, source]) => source).join('\n');
for (const protocol of [
    'common.room.state_req', 'common.room.ready_req',
    'common.room.play_req', 'common.room.pass_req',
    'common.room.trusteeship_req', 'common.room.dissolve_req', 'common.room.continue_req',
]) assert.match(all, new RegExp(protocol.replaceAll('.', '\\.')), `missing runtime protocol ${protocol}`);
assert.doesNotMatch(all, /common\.room\.unready_req/, 'ready is one-way authority; the retired unready command must not return');
assert.doesNotMatch(all, /common\.room\.start_req/, 'PDK now starts authoritatively after ready; client must not keep the retired manual start command');
assert.doesNotMatch(all, /CNJPDKGetPlayBackCode/, 'retired game-socket replay entry must not return');
assert.match(all, /历史回放仅通过大厅战绩接口加载/, 'replay handoff must remain on the Hall records boundary');
assert.match(all, /common\.room\.dispatch/, 'chat and social actions must use the one production room adapter');
assert.doesNotMatch(all, /CNJPDKChat/, 'the retired game-private chat adapter must not be reachable');
assert.match(all, /pendingActions/);
assert.match(all, /\.finally\(\(\) =>/);
assert.match(all, /onReconnect/);
console.log('NJPDK authoritative runtime contract passed');
