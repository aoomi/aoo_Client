import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const club = read('assets/Club/Code/Runtime/LegacyClubMainController.ts');
const lobby = read('assets/Lobby/Code/LobbyScreenController.ts');
const gateway = read('assets/Lobby/Code/HallRoomGateway.ts');
const protocol = read('assets/Common/Code/Runtime/network/ProtocolClient.ts');
const router = read('assets/Login/Code/Navigation/SceneRouter.ts');

test('only explicitly selected LS201 uses waiting entry', () => {
    assert.match(club, /isWaitingEntry[\s\S]{0,500}gameFilterKey\(room\) === 'LS201'/,
        '精简的当前房间包必须通过亲友圈模板恢复LS201身份');
    assert.doesNotMatch(club, /=== 'CD201'[\s\S]{0,120}waitingEntry/);
    assert.doesNotMatch(club, /=== 'NJ201'[\s\S]{0,120}waitingEntry/);
});

test('waiting entry stays in club until full or a second tap', () => {
    assert.doesNotMatch(club, /this\.rooms = next;[\s\S]{0,300}this\.enterFullWaitingRoom\(\)/,
        '亲友圈桌面刷新不得与大厅会话并发签票和切场');
    assert.match(lobby, /sameSelectedDesk = currentRoomId > 0 && this\.sameWaitingDesk/,
        '已占座后再点同一模板桌必须识别为同一张实体桌');
    assert.match(lobby, /currentRoomId === existingRoomId \|\| sameSelectedDesk/);
    assert.match(lobby, /if \(!enterCurrentWaitingRoom\)/);
    assert.match(lobby, /room\.CBaseRoomConfig[\s\S]{0,300}mainNode\.emit\('legacy-club-show-current-room'/,
        '等待玩法坐下成功后必须留在亲友圈并显示当前座位提示层');
    assert.match(club, /mainNode\.on\('legacy-club-show-current-room'/,
        'ClubMain 必须接收等待房间数据并打开内嵌 RoomDetails');
    assert.match(club, /mergeCurrentWaitingRoom\(room\)[\s\S]{0,100}openCurrentRoomDetails\(room\)/,
        '占座成功后必须立即把玩家座位投影到桌面，不能等下一次轮询');
    assert.match(lobby, /client\.on\('club\.waiting_room_ready'[\s\S]{0,240}queueWaitingRoomReady\(roomId\)/,
        '满员切场必须由常驻大厅会话统一消费，不能依赖ClubMain生命周期');
    assert.match(lobby, /consumeWaitingRoomReady[\s\S]{0,900}hallRoomGateway\?\.activeRoom\(\)[\s\S]{0,500}waitingFull !== true/,
        '大厅会话必须按当前账号的权威满员状态取得独立票据');
    assert.match(lobby, /waitingReadyAttempt[\s\S]{0,1800}attempt < 10/,
        '满员恢复必须有界重试并维持单一入口');
    assert.match(club, /\[ClubWaitingDesk\] ready-observed/);
    assert.doesNotMatch(lobby, /forceEnter|waitingHandoffRetryTimer/,
        '废弃的页面级满员入口不得继续与大厅会话协调器竞争');
    assert.match(protocol, /event === 'club\.waiting_room_ready'/);
});

test('waiting entry supports changing and leaving the reserved seat', () => {
    assert.match(lobby, /leaveWaiting\(currentRoomId\)/);
    assert.match(lobby, /changedDesk = currentRoomId > 0 && !sameSelectedDesk/,
        '同一张桌第二次点击不得提示换桌成功');
    assert.match(lobby, /换桌成功/);
    assert.match(gateway, /public async joinWaiting/);
    assert.match(gateway, /public async leaveWaiting/);
    assert.match(club, /room\.CBaseExitRoom/);
    assert.match(club, /const roomId = Number\(current\.roomId \?\? current\.roomID \?\? 0\);[\s\S]{0,500}if \(roomId > 0\)[\s\S]{0,300}room\.CBaseExitRoom/,
        '亲友圈返回必须依据权威 roomId 退出当前房间，不得受精简投影缺少玩法字段影响');
    assert.match(club, /room\.CBaseExitRoom[\s\S]{0,500}this\.forms\.closeAfterPointer\(path\)/,
        '退出当前房间成功后必须继续返回大厅');
    assert.match(club, /isNoActiveRoomError\(configError\)[\s\S]{0,500}this\.forms\.closeAfterPointer\(path\)/,
        '兼容服务明确返回玩家不在房间时必须直接返回大厅');
    assert.match(club, /PLAYER_NOT_ROOM\|玩家不在房间\|player is not/,
        '只能把明确的无房错误识别为无房，不能吞掉网络或超时错误');
    assert.match(club, /room\.CBaseRoomConfig[\s\S]{0,900}game\.C1101GetRoomID/,
        'RoomConfig不可用时必须使用大厅启动查询作为权威房间号兜底');
    assert.match(club, /active-room-fallback-used/,
        '兜底查询必须留下可检索诊断日志');
    assert.match(club, /projectedPlayerRoom\(\)[\s\S]{0,600}active-room-local-fallback/,
        '两种查询都不可用时必须使用当前玩家的桌面座位投影判断是否需要退房');
    assert.match(club, /source: 'local-projection'[\s\S]{0,300}this\.forms\.closeAfterPointer\(path\)/,
        '查询不可用且桌面没有当前玩家座位时应直接返回大厅');
});

test('ordinary re-entry resumes the current account seat before attempting another join', () => {
    assert.match(gateway, /private async joinOnce[\s\S]*\/api\/v2\/hall\/rooms\/active/);
    assert.match(gateway, /if \(active\.active\)[\s\S]*activeRoomId !== roomId[\s\S]*handoffFromRoom/);
    assert.ok(gateway.indexOf("'/api/v2/hall/rooms/active'")
        < gateway.indexOf("`/api/v2/hall/rooms/${roomId}/join`"));
});

test('refresh keeps a non-full LS201 waiting room in ClubMain', () => {
    assert.match(router, /gameName\?\.trim\(\)\.toUpperCase\(\) === 'LS201'/);
    assert.match(router, /waitingFull !== true[\s\S]{0,120}state !== 'PLAYING'/);
    assert.match(router, /restoreLastClubBeforeShow: true[\s\S]{0,160}skipRoomRecovery: true[\s\S]{0,400}waiting-club-room-held/);
    assert.ok(router.indexOf('if (activeRoom && waitingClubRoom)')
        < router.indexOf('await this.recoverRoomHandoff(account, role, activeRoom, gateway, parent, report)'),
    '等待状态必须在普通活动房间自动恢复之前截获');
});
