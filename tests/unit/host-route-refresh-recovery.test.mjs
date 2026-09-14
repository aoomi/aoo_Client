import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('公共刷新位置覆盖登录、大厅、亲友圈和游戏房间', () => {
    const route = read('assets/Common/Code/Runtime/navigation/Route.ts');
    const store = read('assets/Common/Code/Runtime/navigation/HostRouteStore.ts');
    for (const name of ['login', 'lobby', 'club', 'game']) assert.match(route, new RegExp(`name: '${name}'`));
    assert.match(store, /aoo\.host-route\.v1\./);
    assert.match(store, /this\.isRoute\(route\.returnTo\)/);
});

test('启动恢复优先服务端活动房间，否则恢复亲友圈或大厅', () => {
    const router = read('assets/Login/Code/Navigation/SceneRouter.ts');
    const activeRoom = router.indexOf('activeRoom = await gateway.activeRoom()');
    const savedRoute = router.indexOf('hostRouteStore.load(String(account.accountId))');
    assert.ok(activeRoom >= 0 && savedRoute > activeRoom);
    assert.match(router, /savedRoute\?\.name === 'club'/);
    assert.match(router, /restoreLastClubBeforeShow: true/);
    assert.match(router, /Number\(savedRoute\.roomId\) === Number\(activeRoom\.roomId\)/);
    assert.match(router, /entryOrigin: 'CLUB'[\s\S]*returnContext: \{ clubId: returnTo\.clubId \}/);
});

test('刷新恢复房间退出不等待已关闭的 Hall 连接超时', () => {
    const coordinator = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts');
    assert.match(coordinator, /await this\.recoverHall\(false\)/);
    assert.match(coordinator, /private async recoverHall\(reconnect = true\)/);
    assert.match(coordinator, /if \(reconnect && !this\.hallClient\.isConnected\(\)\)/);
});

test('业务位置只在成功展示后提交', () => {
    const club = read('assets/Lobby/Code/ClubList/LobbyClubEntryController.ts');
    const room = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkGameSceneLauncher.ts');
    assert.ok(club.indexOf('await this.forms.show(path') < club.indexOf("name: 'club'"));
    assert.ok(room.indexOf("this.stage('mount-room-runtime'") < room.indexOf("name: 'game'"));
});

test('亲友圈返回大厅会提交大厅位置', () => {
    const entry = read('assets/Lobby/Code/ClubList/LobbyClubEntryController.ts');
    const club = read('assets/Club/Code/Runtime/LegacyClubMainController.ts');
    assert.match(entry, /hostRouteStore\.save\(this\.accountId, \{ name: 'lobby' \}\)/);
    assert.match(club, /this\.mainNode\.active = true;\s*this\.onReturnLobby\(\)/);
});

test('俱乐部房间返回使用本次进入房间的权威俱乐部 ID', () => {
    const router = read('assets/Login/Code/Navigation/SceneRouter.ts');
    const lobby = read('assets/Lobby/Code/LobbyScreenController.ts');
    const entry = read('assets/Lobby/Code/ClubList/LobbyClubEntryController.ts');
    assert.match(router, /target\?\.returnContext/);
    assert.match(router, /restoreClubId:/);
    assert.match(lobby, /restoreLastClub\(this\.startupOptions\.restoreClubId\)/);
    assert.match(entry, /return await this\.enterClub\(\{ id: Number\(preferredClubId\) \}\)/);
    assert.match(entry, /private async enterClub[\s\S]*Promise<boolean>/);
});

test('Hall 断线恢复后重新拉取并渲染当前俱乐部模板桌', () => {
    const network = read('assets/Login/Code/Network/NetworkRuntime.ts');
    const club = read('assets/Club/Code/Runtime/LegacyClubMainController.ts');
    const entry = read('assets/Lobby/Code/ClubList/LobbyClubEntryController.ts');
    assert.match(network, /recover: async \(\) => this\.hallTransport\.recoverGeneration\(generation\)/);
    assert.match(club, /this\.client\.onReconnect\(\(\) => this\.restoreTemplatesAfterReconnect\(\)\)/);
    assert.match(club, /await this\.refreshTemplateRooms\(\)/);
    assert.doesNotMatch(entry, /C(?:Union|Club)RoomConfigItemList[\s\S]{0,220}\.catch\(\(\) => \[\]\)/);
});
