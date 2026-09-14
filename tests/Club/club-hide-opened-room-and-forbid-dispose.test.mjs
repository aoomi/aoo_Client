import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyClubMainController.ts', import.meta.url), 'utf8');
const forbid = fs.readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyClubForbidController.ts', import.meta.url), 'utf8');

assert.match(main, /node\('HideRoomToggle'\)\?\.getComponent\(Toggle\)/);
assert.match(main, /hideRoomToggle\.node\.on\(Toggle\.EventType\.TOGGLE, change\)/);
assert.match(main, /this\.hideOpenedRooms[\s\S]*filteredRooms\.filter\(\(room\) => Number\(room\.setId \?\? 0\) <= 0\)/,
    'hide-opened toggle must preserve occupied waiting rooms and hide only rooms whose game has started');
assert.match(forbid, /if \(isValid\(node, true\)\) node\.off\(Button\.EventType\.CLICK, listener\)/);

console.log('club hide-opened-room and restriction-group disposal passed');
