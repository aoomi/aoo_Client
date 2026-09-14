import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../../assets/Games/Mahjong/Packs/Pack01/Code/Runtime/hzmj/', import.meta.url);
const runtime = await readFile(new URL('HzmjRuntime.ts', root), 'utf8');
const switcher = await readFile(new URL('HzmjSwitchCoordinator.ts', root), 'utf8');
const lobby = await readFile(new URL('../../assets/Lobby/Code/LobbyScreenController.ts', import.meta.url), 'utf8');

for (const source of [runtime, switcher]) {
    assert.doesNotMatch(source, /CompatibilityApp\/hzmj/,
        'canonical Mahjong runtime must not route through the compatibility bridge');
}
assert.match(lobby, /Games\/Mahjong\/Packs\/Pack01\/Code\/Runtime\/hzmj\/HzmjSwitchCoordinator/);
assert.match(runtime, /CHZMJGetRoomInfo/);          // join and reconnect snapshot
assert.match(runtime, /CBaseReadyRoom/);           // ready
assert.match(runtime, /CBaseStartGame/);           // start
assert.match(runtime, /CHZMJOpCard/);              // operation
assert.match(runtime, /HZMJ_Reconnected/);         // UI reconnect callback
assert.match(runtime, /CHZMJRoomRecord/);           // settlement/record UI request
assert.match(runtime, /CHZMJGetPlayBackCode/);      // replay request
assert.match(switcher, /enterReplay/);              // replay UI callback path

const modelDir = new URL('model/', root);
const models = (await readdir(modelDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'));
for (const model of models) {
    const source = await readFile(join(modelDir.pathname, model.name), 'utf8');
    assert.doesNotMatch(source, /CompatibilityApp\/hzmj/,
        `${model.name} must be owned by the canonical Mahjong pack`);
}

console.log('Mahjong production entry and create-to-replay client chain passed');
