import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyClubMainController.ts', import.meta.url), 'utf8');
const forbid = fs.readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyClubForbidController.ts', import.meta.url), 'utf8');

assert.match(main, /node\('HideRoomToggle'\)\?\.getComponent\(Toggle\)/);
assert.match(main, /hideRoomToggle\.node\.on\(Toggle\.EventType\.TOGGLE, change\)/);
assert.match(main, /this\.hideFullRooms[\s\S]*filteredRooms\.filter\(\(room\) => !this\.isFullRoom\(room\)\)/,
    'hide-full toggle must keep non-full entity desks visible for avatars and second-tap entry');
assert.match(main, /getChildByName\('YesSelect'\)[\s\S]*checkmark\.active = this\.hideFullRooms/,
    'hide-full toggle must synchronize its authored checkmark');
assert.match(main, /hideRoomToggle\.checkMark = checkmarkSprite/,
    'hide-opened toggle must attach the authored Checkmark sprite to the Toggle component');
assert.match(main, /hideRoomToggle\.isChecked = false/,
    'hide-full rooms must be opt-in whenever ClubMain opens');
assert.match(forbid, /if \(isValid\(node, true\)\) node\.off\(Button\.EventType\.CLICK, listener\)/);

console.log('club hide-opened-room and restriction-group disposal passed');
