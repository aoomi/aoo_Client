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

test('CommonHead offers an opt-in XQP circular skin without replacing occupancy state', () => {
    const controller = read('assets/Common/Code/UI/CommonHeadController.ts');
    const commonHead = JSON.parse(read('assets/Common/Prefab/CommonHead.prefab'));
    const nodeNames = commonHead.filter((entry) => entry?.__type__ === 'cc.Node').map((entry) => entry._name);

    assert.match(controller, /export type CommonHeadSkin = 'DEFAULT' \| 'XQP_CIRCULAR'/);
    assert.match(controller, /public useSkin\(skin: CommonHeadSkin\)/);
    assert.match(controller, /if \(skin === 'XQP_CIRCULAR'\) this\.applyXqpCircularSkin\(\)/);
    assert.match(controller, /this\.layout\(head, 0, 0, 90, 90\)/);
    assert.match(controller, /this\.layout\(round, 0, 0, 90, 90\)/);
    assert.match(controller, /this\.layout\(frame, 0, 0, 90, 90\)/);
    assert.match(controller, /this\.layout\(mask, 0, 0, 85, 85\)/);
    assert.match(controller, /this\.layout\(avatar, 0, 0, 90, 90\)/);
    assert.match(controller, /roundMask\.type = Mask\.Type\.ELLIPSE/);
    assert.match(controller, /this\.layout\(name, 0, -32\.5, 88, 25\)/);
    assert.match(controller, /this\.layout\(score, 0, -60, 90, 25\)/);
    assert.match(controller, /ensureXqpPlate\(playerInfo, 'NcBg', 0, -32\.969, 120, 24\)/);
    assert.match(controller, /ensureXqpPlate\(playerInfo, 'CentBg', 0, -60\.469, 90, 25\)/);
    assert.match(controller, /this\.syncXqpOccupancyVisuals\(occupied\)/);
    assert.match(controller, /new Node\('XqpVacancy'\)/);
    assert.match(controller, /label\.string = '空位'/);
    assert.match(controller, /mask\.active = visible/);
    assert.match(controller, /empty\.active = this\.skin === 'XQP_CIRCULAR' && !occupied/);
    assert.equal((controller.match(/public showGamePlayer\(occupied: boolean\)/g) ?? []).length, 1,
        'the skin must reuse the one CommonHead occupancy entry point');
    for (const required of ['SquareAvatar', 'RoundAvatar', 'Mask', 'Img_Avatar', 'PlayerInfo', 'Lb_PlayerName', 'Lb_PlayerScore']) {
        assert.ok(nodeNames.includes(required), `CommonHead prefab missing ${required}`);
    }
});
