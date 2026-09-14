import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const clientRoot = path.resolve(import.meta.dirname, '../..');
const read = relative => fs.readFileSync(path.join(clientRoot, relative), 'utf8');

test('联盟建房使用下一步并接通 ClubRoomFee 参数界面', () => {
    const selector = read('assets/Modules/CreateRoom/Code/PlaySelectorController.ts');
    const clubMain = read('assets/Club/Code/Runtime/LegacyClubMainController.ts');
    const clubRoomManager = read('assets/Club/Code/Runtime/LegacyClubRoomManagementController.ts');
    const unionManager = read('assets/Club/Code/Runtime/LegacyUnionManagerController.ts');
    const settings = read('assets/Club/Code/Runtime/ClubRoomFeeController.ts');
    const lobby = read('assets/Lobby/Code/LobbyScreenController.ts');
    const formManager = read('assets/Common/Code/Runtime/ui/LegacyFormManager.ts');
    const createRoom = JSON.parse(read('assets/Modules/CreateRoom/Prefab/CreateRoom.prefab'));
    const settingsPrefab = JSON.parse(read('assets/Club/Prefab/ClubRoomFee.prefab'));
    const settingsMeta = JSON.parse(read('assets/Club/Prefab/ClubRoomFee.prefab.meta'));

    const node = (records, name) => records.find(record => record?.__type__ === 'cc.Node' && record._name === name);
    const label = (records, value) => records.find(record => record?.__type__ === 'cc.Label' && record._string === value);

    assert.ok(node(createRoom, 'Btn_Next'));
    assert.ok(label(createRoom, '下一步'));
    assert.equal(node(createRoom, 'Btn_Create')._active, true);
    assert.equal(node(createRoom, 'Btn_Next')._active, false);
    assert.match(selector, /NEXT_BUTTON_PATH = 'Bottom\/Btn_Next'/);
    assert.match(selector, /this\.club\?\.templateRoomMode/);
    assert.match(selector, /forms\.show\('ui\/club\/UIClubRoomFee'/);
    assert.match(selector, /Number\(this\.club\.clubId \?\? 0\) <= 0/);
    assert.doesNotMatch(selector, /Number\(this\.club\.unionId \?\? 0\) <= 0/,
        '普通亲友圈的 unionId=0 是合法上下文，不能阻断下一步');
    assert.match(selector, /!node\.activeInHierarchy \|\| !button\.interactable/,
        '重叠的隐藏创建按钮不得响应下一步的捕获点击');
    assert.match(clubMain, /btn_roomlist'\), \(\) => this\.openRoomManagement\(\)/);
    assert.match(clubMain, /btn_roomManger'\), \(\) => \{\s*this\.openRoomManagement\(\)/);
    assert.match(clubMain, /btn_RoomMgr'\), \(\) => \{\s*this\.openRoomManagement\(\)/);
    assert.match(clubMain, /defaultPage: 'btn_Wanfa'/);
    assert.match(clubRoomManager, /templateRoomMode: true/);
    assert.match(clubRoomManager, /gameList: room\?\.gameType \? \[room\.gameType\] : \[\]/,
        '新增模板不得使用已有模板派生的旧 gameList 过滤权威玩法目录');
    assert.match(selector, /this\.allowedGameKeys\.has\(game\.gameCode\.toUpperCase\(\)\)/,
        '编辑模板时必须按稳定业务编码锁定玩法，不能只接受数字 gameId');
    assert.match(unionManager, /this\.roomFee\.install\(\)/);
    assert.match(settings, /unionId > 0 \? 'union\.CUnionCreateRoom' : 'club\.CClubCreateGameSet'/);
    assert.match(settings, /bigWinnerConsumeList/);
    assert.doesNotMatch(settings, /bRoomConfigure: cfg/);
    assert.match(settings, /onTemplateSaved\?\.\(savedRoom\)/);
    assert.match(unionManager, /onTemplateSaved: this\.context\.onTemplateSaved/);
    assert.match(unionManager, /toggleRoomControl\(content, node, id, status\)/,
        '联盟玩法行必须由统一的互斥展开逻辑控制');
    assert.match(unionManager, /for \(const row of content\.children\) this\.setRoomRowExpanded\(row, opening && row === selected\)/,
        '展开当前玩法时必须自动收起其他玩法');
    assert.match(unionManager, /expanded \? 396 : 86/,
        '联盟玩法行必须按照2.22的高度展开，并在收起时恢复原高度');
    assert.match(unionManager, /btn_delRoom', true[\s\S]*btn_unUseing', status === 0[\s\S]*btn_useing', status !== 0/,
        '操作区必须提供删除以及与当前状态相反的启用或停用操作');
    assert.match(clubMain, /this\.forms\.close\(path\);[\s\S]*await this\.restoreAuthoritativeTemplates\(clubId, '保存联盟模板后的刷新', savedRoom\)/);
    assert.match(clubMain, /unionId > 0 \? 'union\.CUnionRoomConfigItemList' : 'club\.CClubRoomConfigItemList'/);
    assert.match(clubMain, /private templateRoomArray\(body: unknown\): ClubRoom\[\]/);
    assert.match(clubMain, /packet\.clubCreateGameSets \?\? packet\.roomList \?\? \[body\]/);
    assert.match(clubMain, /room\.roomKey, room\.configId, room\.id, room\.gameIndex[\s\S]*base\.gameIndex, config\.gameIndex/,
        '普通亲友圈和赛事模板都必须转换出大厅渲染所需的 roomKey');
    assert.match(clubMain, /config\.baseCreateRoom[\s\S]*room\.size \?\? base\.playerNum/,
        '普通亲友圈模板必须展开服务端 bRoomConfigure.baseCreateRoom 后再选择桌型人数');
    assert.match(clubMain, /this\.rooms\[index\] = \{ \.\.\.saved\[0\], \.\.\.this\.rooms\[index\] \}/,
        '创建响应不得用缺失桌型字段覆盖大厅权威快照');
    assert.match(clubMain, /refreshRoomsFromTemplatePush/,
        '游戏中房间推送不得清空空闲模板桌');
    assert.match(clubMain, /else this\.rooms\.push\(saved\[0\]\)/,
        '列表接口短暂延迟时必须立即补入本次保存成功的模板桌');
    assert.match(lobby, /String\(room\.gameName \?\? ''\)/,
        '模板桌点击必须把稳定玩法编码传入进房分流');
    assert.match(lobby, /stableGameCode === 'CD201'[\s\S]*stableGameCode === 'NJ201'[\s\S]*stableGameCode === 'LS201'/);
    assert.match(lobby, /await this\.client\.request<\{ roomId\?: unknown; roomID\?: unknown \}>\('room\.CBaseEnterRoom'/,
        '地区跑得快模板桌必须先执行权威建桌/进房请求');
    assert.match(lobby, /roomKey, posID: -1, password: '', clubId, existQuickJoin: false/,
        '模板桌必须按旧版协议把空配置房间号交给服务端权威建桌并进入');
    assert.match(lobby, /this\.hallRoomGateway\.join\(roomId\)/,
        '服务端返回真实房间号后必须签发票据并进入权威玩法');
    assert.match(lobby, /private roomEntryMessage\(reason: unknown\): string/);
    for (const text of ['房间密码错误', '房间人数已满', '房间已经开局', '该模板桌已停用',
        '房主房卡不足，暂时无法进入', '房间暂不可用，请刷新后重试']) {
        assert.ok(lobby.includes(text), `服务端进房失败原因必须转为中文：${text}`);
    }
    assert.match(lobby, /gameId: gameType, gameName, roomKey/,
        '外部玩法兜底也不得再产生缺少 gameName 的 handoff');
    assert.match(settings, /JoinGamePoint: entry/);
    assert.match(settings, /deskColor:/);
    assert.match(settings, /rule,/);
    assert.equal(node(settingsPrefab, 'ClubRoomFee')?._name, 'ClubRoomFee');
    assert.ok(node(settingsPrefab, 'NameInput'));
    assert.ok(node(settingsPrefab, 'EntryCent'));
    assert.ok(label(settingsPrefab, '房间名称'));
    assert.ok(label(settingsPrefab, '入场分数'));
    assert.match(formManager, /bindClubNumericNumpads\(form\)/);
    assert.match(formManager, /form\.path\.startsWith\('club\/'\) \|\| form\.path\.includes\('\/club\/'\)/);
    assert.match(formManager, /clubNumpadService\.open\(form\.node, \(\) => this\.loadCommonNumpad\(\)/);
    assert.match(formManager, /\['UIJoinClub', 'UIJoinUnion'\]\.includes\(form\.name\)/);
    assert.match(formManager, /EditBox\.InputMode\.NUMERIC/);
    assert.match(formManager, /EditBox\.InputMode\.PHONE_NUMBER/);
    for (const field of [
        'UIClubPromoterAdd/EditBox', 'UIForbidAddUser/EditBox', 'UIForbidGameAddUser/EditBox',
        'ClubPromoterLevelAdd/EditBox', 'UIPromoterXIaShuAdd/EditBox', 'UIPromoterXiaShuList/EditBox',
        'UIUnionYaoQing/EditBox', 'UIYaoQing/EditBox',
    ]) assert.ok(formManager.includes(`'${field}'`), `${field} 必须使用 Common Numpad`);
    assert.equal(settingsMeta.uuid, 'aa957b46-d867-4e72-9c32-9774f4e53a10');
});
