import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const club = read('assets/Club/Code/Runtime/LegacyClubMainController.ts');
const lobby = read('assets/Lobby/Code/LobbyScreenController.ts');
const gateway = read('assets/Lobby/Code/HallRoomGateway.ts');
const protocol = read('assets/Common/Code/Runtime/network/ProtocolClient.ts');

test('only explicitly selected LS201 uses waiting entry', () => {
    assert.match(club, /isWaitingEntry[\s\S]*=== 'LS201'/);
    assert.doesNotMatch(club, /=== 'CD201'[\s\S]{0,120}waitingEntry/);
    assert.doesNotMatch(club, /=== 'NJ201'[\s\S]{0,120}waitingEntry/);
});

test('waiting entry stays in club until full or a second tap', () => {
    assert.match(club, /occupied\.length >= Number\(item\.playerNum\)/);
    assert.match(club, /forceEnter: true/);
    assert.match(club, /this\.rooms = next;[\s\S]{0,300}this\.enterFullWaitingRoom\(\);[\s\S]{0,100}this\.renderRooms\(\);/,
        '满员进房必须由权威快照直接触发，不能等待异步 Prefab 渲染完成');
    assert.match(lobby, /enterCurrentWaitingRoom = existingRoomId > 0 && currentRoomId === existingRoomId/);
    assert.match(lobby, /if \(!forceEnter && !enterCurrentWaitingRoom\)/);
    assert.match(lobby, /room\.CBaseRoomConfig[\s\S]{0,260}forms\?\.show\('ui\/club\/UIClubInRoom'/,
        '等待玩法坐下成功后必须留在亲友圈并显示当前座位提示层');
    assert.match(club, /requestLobby<ClubRoom[\s\S]{0,180}room\.CBaseRoomConfig/,
        '每个等待客户端必须查询自己所在的权威房间，不能只依赖公共桌子快照');
    assert.match(club, /occupiedCount >= playerNum/,
        '协议布尔值形态不一致时仍须由权威人数触发全部等待玩家进房');
    assert.match(club, /waitingEntry: true,[\s\S]{0,80}forceEnter: true/);
    assert.match(club, /client\.on\('club\.waiting_room_ready'/,
        '服务端满员推送必须唤醒所有已等待客户端');
    assert.match(club, /enterCurrentWaitingRoomWhenFull\(roomId\)/,
        '满员推送必须绑定来源房间，换桌后不能消费旧房间事件');
    assert.match(lobby, /if \(forceEnter && !enterCurrentWaitingRoom\)[\s\S]{0,120}return;/,
        '换桌后到达的旧房间自动进房请求必须静默丢弃');
    assert.match(lobby, /waitingEntry && forceEnter && !this\.waitingHandoffRetryTimer[\s\S]{0,420}this\.enterRoom\(/,
        '最后一个玩家坐桌期间到达的满员通知必须排队重试，不能因入口正忙而丢失');
    assert.match(lobby, /waitingEntry && forceEnter[\s\S]{0,120}resumeWaiting\(roomId\)/,
        '满员后的统一拉入只能恢复已提交座位并签发票据，不能再次并发占座');
    assert.match(gateway, /public async resumeWaiting\(roomId: number\)[\s\S]{0,180}this\.activeRoom\(\)/,
        '每个等待客户端必须从自己的活动房间取得独立连接票据');
    assert.match(club, /armWaitingHandoffRetry\(roomId\)[\s\S]{0,700}waitingHandoffRoomId = 0;[\s\S]{0,120}enterCurrentWaitingRoomWhenFull\(roomId\)/,
        '首次导航未成功时必须释放去重锁并按权威成员状态重试');
    assert.match(protocol, /event === 'club\.waiting_room_ready'/);
});

test('waiting entry supports changing and leaving the reserved seat', () => {
    assert.match(lobby, /leaveWaiting\(currentRoomId\)/);
    assert.match(lobby, /换桌成功/);
    assert.match(gateway, /public async joinWaiting/);
    assert.match(gateway, /public async leaveWaiting/);
    assert.match(club, /room\.CBaseExitRoom/);
    assert.match(club, /const roomId = Number\(current\.roomId \?\? current\.roomID \?\? 0\);[\s\S]{0,500}if \(roomId > 0\)[\s\S]{0,300}room\.CBaseExitRoom/,
        '亲友圈返回必须依据权威 roomId 退出当前房间');
    assert.match(club, /room\.CBaseExitRoom[\s\S]{0,500}this\.forms\.closeAfterPointer\(path\)/,
        '退出当前房间成功后必须继续返回大厅');
    assert.match(club, /room\.CBaseRoomConfig[\s\S]{0,900}game\.C1101GetRoomID/,
        'RoomConfig不可用时必须使用大厅启动查询作为房间号兜底');
    assert.match(club, /projectedPlayerRoom\(\)[\s\S]{0,600}active-room-local-fallback/,
        '两种查询都不可用时必须使用当前玩家的桌面座位投影判断是否需要退房');
    assert.match(club, /source: 'local-projection'[\s\S]{0,300}this\.forms\.closeAfterPointer\(path\)/,
        '查询不可用且桌面没有当前玩家座位时应直接返回大厅');
});
