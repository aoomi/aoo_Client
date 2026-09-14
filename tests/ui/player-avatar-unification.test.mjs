import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('all active avatar renderers use the public player avatar service', () => {
    const service = read('assets/Common/Code/UI/PlayerAvatarService.ts');
    assert.match(service, /AVATAR_FILE_COUNT = 10000/);
    assert.match(service, /static async assign/);

    const consumers = [
        'assets/Common/Code/UI/CommonHeadController.ts',
        'assets/Lobby/Code/LobbyScreenController.ts',
        'assets/Lobby/Code/ClubList/LobbyClubListController.ts',
        'assets/Club/Code/Runtime/ClubBox/ClubBoxController.ts',
        'assets/Club/Code/Runtime/LegacyClubMainController.ts',
        'assets/Common/Code/Runtime/CompatibilityApp/aypdk/AypdkPlayController.ts',
    ];
    for (const path of consumers) assert.match(read(path), /PlayerAvatarService/, path);
});

test('club desk player state assigns its Avatar sprite by player id', () => {
    const source = read('assets/Club/Code/Runtime/LegacyClubMainController.ts');
    assert.match(source, /findDescendant\(playerState, 'Avatar'\)\?\.getComponent\(Sprite\)/);
    assert.match(source, /PlayerAvatarService\.assign\(avatar, playerId/);
});
