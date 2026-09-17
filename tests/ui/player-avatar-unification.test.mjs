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
        'assets/Common/Code/Runtime/CompatibilityApp/aypdk/AypdkPlayController.ts',
    ];
    for (const path of consumers) assert.match(read(path), /PlayerAvatarService/, path);
});

test('club desk player state uses the current CommonHead contract and guarded avatar lifecycle', () => {
    const source = read('assets/Club/Code/Runtime/LegacyClubMainController.ts');
    const commonHead = JSON.parse(read('assets/Common/Prefab/CommonHead.prefab'));
    const nodeNames = commonHead
        .filter((entry) => entry?.__type__ === 'cc.Node')
        .map((entry) => entry._name);

    assert.match(source, /getComponent\(CommonHeadController\)/);
    assert.match(source, /headController\.useVariant\('Stat'\)/);
    assert.match(source, /setDescendantLabel\(playerState, 'Lb_PlayerName'/);
    assert.match(source, /headController\.showPlayerAvatar\(playerId/);
    assert.doesNotMatch(source, /findDescendant\(playerState, 'Avatar'\)/);
    assert.ok(nodeNames.includes('Img_Avatar'));
    assert.ok(nodeNames.includes('Lb_PlayerName'));
});

test('CommonHead keeps its authored avatar when a stale or failed request cannot commit', () => {
    const controller = read('assets/Common/Code/UI/CommonHeadController.ts');
    const commonHead = JSON.parse(read('assets/Common/Prefab/CommonHead.prefab'));
    const avatarNodes = commonHead.filter((entry) =>
        entry?.__type__ === 'cc.Node' && entry._name === 'Img_Avatar');
    const authoredFrames = avatarNodes.map((node) => node._components?.[1]?.__id__)
        .map((id) => commonHead[id]?._spriteFrame);

    assert.match(controller, /const generation = \+\+this\.avatarGeneration/);
    assert.match(controller, /!frame \|\| generation !== this\.avatarGeneration \|\| !this\.node\.isValid/);
    assert.equal(avatarNodes.length, 4);
    assert.ok(authoredFrames.every((frame) => typeof frame?.__uuid__ === 'string'),
        'all CommonHead variants must retain an authored default avatar SpriteFrame');
});

test('empty game seats keep CommonHead Game visible and hide player labels', () => {
    const controller = read('assets/Common/Code/UI/CommonHeadController.ts');
    const seats = read('assets/Games/Poker/PDK/Common/Code/Runtime/Room/SeatPresenter.ts');
    const room = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts');

    assert.match(controller, /public showGamePlayer\(occupied: boolean\)/);
    assert.match(controller, /const game = this\.useVariant\('Game'\)/);
    assert.match(controller, /playerInfo\.active = occupied/);
    assert.match(controller, /for \(const \[sprite, frame\] of this\.authoredAvatarFrames\)/);
    assert.match(controller, /for \(const name of \['Lb_PlayerName', 'Lb_PlayerScore'\]\)/);
    assert.match(controller, /game\.active = true/);
    assert.match(seats, /controller\.showGamePlayer\(playerId > 0\)/);
    assert.doesNotMatch(room, /if \(Number\(player\.pid \?\? 0\) <= 0\) \{\s*seats\.clearHead/);
});
