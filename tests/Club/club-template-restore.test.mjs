import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const main = readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyClubMainController.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../../assets/Lobby/Code/ClubList/LobbyClubEntryController.ts', import.meta.url), 'utf8');
const lobby = readFileSync(new URL('../../assets/Lobby/Code/LobbyScreenController.ts', import.meta.url), 'utf8');
const router = readFileSync(new URL('../../assets/Login/Code/Navigation/SceneRouter.ts', import.meta.url), 'utf8');

test('club templates use one authoritative restore path with stale-response rejection', () => {
    assert.match(main, /public async restoreAuthoritativeTemplates\(/);
    assert.match(main, /generation !== this\.templateRestoreGeneration/);
    assert.match(main, /this\.clubId\(\) !== clubId/);
    assert.match(main, /request<LegacyClubDetail>\('club\.CGetClubListById', \{ clubId \}\)[\s\S]*const unionId = Number\(this\.club\.unionId \?\? 0\)/,
        '恢复模板前必须刷新权威联盟归属，不能使用返回上下文中的旧 unionId');
    assert.match(main, /restoreTemplatesAfterReconnect[\s\S]*restoreAuthoritativeTemplates/);
    assert.match(main, /restoreTemplatesAfterReconnect[\s\S]*globalThis\.setTimeout/,
        '模板查询必须等 Hall 连接从 RECOVERING 提交到 READY');
    assert.match(main, /const hasRenderedSnapshot = this\.rooms\.length > 0;[\s\S]*hasRenderedSnapshot \? 'content' : 'error'/,
        '断线刷新失败时必须保留已显示的模板桌');
    assert.match(main, /refreshRoomsFromTemplatePush[\s\S]*restoreAuthoritativeTemplates/);
    assert.match(main, /const roomPacket = unionId > 0 \? 'union\.CUnionGetAllRoomMin' : 'club\.CClubGetAllRoomMin'/,
        '实体房间必须按当前亲友圈或联盟作用域读取');
    assert.match(main, /Promise\.all\(\[[\s\S]*request<unknown>\(roomPacket, scope\)/,
        '2.2.2 大厅语义必须同时恢复实体房间和模板空桌');
    assert.match(main, /return \[\.\.\.active, \.\.\.templates\]/,
        '玩家进入模板房后仍须保留该模板的空桌');
    assert.match(main, /Number\(room\.playerNum \?\? 0\) > 0[\s\S]*Number\(template\?\.playerNum \?\? 0\)/,
        '实体房投影缺少人数时必须继承模板人数，不能被桌型选择器丢弃');
    assert.match(main, /packet\.pos[\s\S]*positions\[seat\] = position/,
        '2.2.2 玩家进房必须增量更新实体桌对应座位');
    assert.match(main, /Number\(position\.pid \?\? 0\) > 0[\s\S]*positions\[seat\] = undefined/,
        '2.2.2 玩家退房必须清空实体桌对应座位');
    assert.match(main, /candidate\.isClose === true[\s\S]*this\.rooms\.splice/,
        '实体房关闭只删除实体桌，不能删除模板空桌');
    assert.match(main, /renderDeskPlayers\(node, room, commonHeadPrefab\)/,
        '实体桌必须把服务端座位状态渲染到桌子');
    assert.match(main, /Number\(seat\.parent\?\.name \?\? -1\)[\s\S]*value\?\.pos[\s\S]*seatNo/,
        '亲友圈大厅桌位必须与游戏内权威座位编号一致');
    assert.match(main, /playerAnchor && !commonHead && commonHeadPrefab/,
        '玩家头像使用本次修改前的 CommonHead 动态挂载逻辑');
    assert.match(main, /startActiveRoomRefresh[\s\S]*setInterval\(\(\) => \{ void this\.refreshActiveRooms\(\); \}, 1000\)/,
        '当前网关缺少 2.2.2 全员房间推送时，必须用权威快照及时补齐');
    assert.match(main, /roomSnapshotKey\(next\) === this\.roomSnapshotKey\(this\.rooms\)/,
        '房间快照未变化时不得重绘整个桌子列表');
    assert.doesNotMatch(main, /refreshTemplateRooms/);
});

test('normal entry and return restoration do not issue competing template requests', () => {
    assert.match(entry, /restoreLastClub[\s\S]*return await this\.enterClub/);
    assert.match(entry, /await this\.forms\.show\(path, \{ club: selected, rooms: \[\] \}\);[\s\S]*restoreAuthoritativeTemplates/);
    assert.doesNotMatch(entry, /CUnionRoomConfigItemList/);
    assert.doesNotMatch(entry, /CClubRoomConfigItemList/);
});

test('反复切换亲友圈不触发退出大厅或重复恢复', () => {
    assert.match(main, /if \(this\.activePath && this\.activePath !== path\) this\.forms\.close\(this\.activePath\)/,
        '相同皮肤的亲友圈必须原地切换');
    assert.match(main, /const internalSwitch = this\.switchingClubId !== 0[\s\S]*if \(!internalSwitch\)[\s\S]*this\.onReturnLobby\(\)/,
        '内部切换不得执行真正退出亲友圈的生命周期');
    const switchMethod = main.match(/private async switchClub[\s\S]*?private clearSwitchListeners/)?.[0] ?? '';
    assert.doesNotMatch(switchMethod, /restoreAuthoritativeTemplates/,
        'show 生命周期已恢复桌子，切换函数不得再发起第二次恢复');
});

test('union room entry preserves its club and union return context', () => {
    assert.match(lobby, /legacy-club-join-room[\s\S]*Number\(room\.unionId \?\? 0\)/);
    assert.match(lobby, /const entryOrigin = unionId > 0 \? 'UNION'/);
    assert.match(lobby, /unionId,[\s\S]*entryOrigin,[\s\S]*returnContext: \{ clubId, unionId \}/);
    assert.match(router, /target => this\.returnFromRoom\(account, role, target\)/,
        '启动期恢复的房间也必须把返回上下文交给大厅路由');
});
