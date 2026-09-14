import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const retired=[
 'assets/Lobby/Prefab/SelectCity.prefab','assets/Lobby/Prefab/MoreGame.prefab','assets/Lobby/Prefab/CreatRoom.prefab',
 'assets/Lobby/Code/Runtime/LegacyRegionController.ts','assets/Lobby/Code/Runtime/LegacyGameCatalogController.ts',
 'assets/Lobby/Code/Runtime/LegacyCreateRoomController.ts','assets/Lobby/Code/Runtime/NativeRoomCreateConfig.ts',
];

function files(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
 const absolute=path.join(directory,entry.name);return entry.isDirectory()?files(absolute):[absolute];
});}

test('unified selector is the only reachable lobby play and room-create entry',()=>{
 for(const relative of retired)assert.equal(existsSync(path.join(root,relative)),false,relative);
 assert.equal(existsSync(path.join(root,'assets/Common/Prefab/create_Room.prefab')),true);
 const sources=files(path.join(root,'assets')).filter(file=>/\.(ts|json)$/.test(file)&&statSync(file).size<2_000_000)
   .map(file=>readFileSync(file,'utf8')).join('\n');
 assert.doesNotMatch(sources,/hall\.regions|UISelectCity|UIMoreGame/);
 assert.match(sources,/common\/create_Room/);
});
