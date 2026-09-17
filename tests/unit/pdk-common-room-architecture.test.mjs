import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const clientRoot = new URL('../..', import.meta.url).pathname;
const commonRoot = join(clientRoot, 'assets/Games/Poker/PDK/Common');
const roomPath = join(commonRoot, 'Prefab/PDK_CommonRoom.prefab');
const sharedRoomPath = join(clientRoot, 'assets/Games/Common/Prefab/CommonRoom.prefab');
const runtimeRoot = join(commonRoot, 'Code/Runtime/Room');
const adapterPath = join(clientRoot, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts');
const switchCoordinatorPath = join(clientRoot, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts');

test('PDK_CommonRoom keeps the saved Creator node contract for four physical seats', () => {
  const serialized = JSON.parse(readFileSync(roomPath, 'utf8'));
  const names = serialized.filter((item) => item?.__type__ === 'cc.Node').map((item) => item._name);
  for (const name of ['PDK_CommonRoom', 'Play_0', 'Play_1', 'Play_2', 'Play_3', 'Hand_Cards',
    'Btn_Pass', 'Btn_Hint', 'Btn_Play', 'Btn_KeepRoomOpen', 'Btn_CloseRoom', 'Btn_NoGrab', 'Btn_GrabDealer']) {
    assert.ok(names.includes(name), `missing prefab contract node: ${name}`);
  }
  const paths = new Set();
  const visit = (id, parent = '') => {
    const node = serialized[id];
    const path = parent ? `${parent}/${node._name}` : node._name;
    paths.add(path);
    for (const child of node._children ?? []) visit(child.__id__, path);
  };
  visit(1);
  for (const path of [
    'PDK_CommonRoom/Btn/Btn_Pass',
    'PDK_CommonRoom/Btn/Btn_Hint',
    'PDK_CommonRoom/Btn/Btn_Play',
    'PDK_CommonRoom/Btn/Btn_KeepRoomOpen',
    'PDK_CommonRoom/Btn/Btn_CloseRoom',
    'PDK_CommonRoom/Btn/Btn_NoGrab',
    'PDK_CommonRoom/Btn/Btn_GrabDealer',
    'PDK_CommonRoom/Players/Play_0/Card/Hand_Cards',
    ...[0, 1, 2, 3].map((slot) => `PDK_CommonRoom/Players/Play_${slot}/Card/Out_Card`),
  ]) assert.ok(paths.has(path), `missing prefab contract path: ${path}`);
});

test('shared room owns common actions and room info while PDK owns only game operations', () => {
  const serialized = JSON.parse(readFileSync(sharedRoomPath, 'utf8'));
  const nodes = serialized
    .map((item, id) => ({ ...item, id }))
    .filter((item) => item?.__type__ === 'cc.Node');
  const root = nodes.find((item) => item._name === 'CommonRoom');
  assert.ok(root, 'missing CommonRoom root');
  for (const name of ['RoomActions', 'WaitingActions', 'TurnActions']) {
    const group = nodes.find((item) => item._name === name);
    assert.ok(group, `missing action group: ${name}`);
    assert.equal(group._parent.__id__, root.id, `${name} must be a direct CommonRoom child`);
  }
  const roomInfo = nodes.find((item) => item._name === 'RoomInfo');
  assert.equal(roomInfo?._parent.__id__, root.id, 'RoomInfo must be a direct CommonRoom child');
  const pdk = JSON.parse(readFileSync(roomPath, 'utf8'));
  const pdkNames = pdk.filter((item) => item?.__type__ === 'cc.Node').map((item) => item._name);
  assert.equal(pdkNames.includes('RoomInfo'), false);
  assert.equal(pdkNames.includes('Btn_Ready'), false);
  assert.equal(pdkNames.includes('Btn_Chat'), false);
});

test('shared room uses the canonical node naming contract including its embedded dissolve dialog', () => {
  const serialized = JSON.parse(readFileSync(sharedRoomPath, 'utf8'));
  const nodes = serialized
    .map((item, id) => ({ ...item, id }))
    .filter((item) => item?.__type__ === 'cc.Node');
  const names = new Set(nodes.map((item) => item._name));
  for (const name of [
    'Btn_Gps', 'Icon_GpsOff', 'Icon_GpsOn', 'Btn_Back', 'Btn_Voice', 'Btn_Chat',
    'Btn_Ready', 'Btn_Start', 'Btn_More', 'Btn_Match', 'Btn_Settings',
    'Btn_DissolveRoom', 'Btn_RoomRule', 'Lb_ClubCent', 'Lb_RoomId', 'Lb_Round',
    'Bg_Rule', 'Icon_RuleTitle', 'CardCounter', 'Bg_CardCounter',
    'DissolveRoom', 'Bg_Header', 'Icon_Dissolve', 'Btn_Close', 'Btn_Reject', 'Btn_Agree',
    'PlayerList', 'PlayerItem_1', 'PlayerItem_10', 'Icon_Agreed', 'Icon_Rejected',
  ]) assert.ok(names.has(name), `missing canonical CommonRoom node: ${name}`);
  const dissolveRoom = nodes.find((item) => item._name === 'DissolveRoom');
  const commonRoom = nodes.find((item) => item._name === 'CommonRoom');
  assert.equal(dissolveRoom?._parent.__id__, commonRoom?.id, 'DissolveRoom must be embedded in CommonRoom');

  const buttonNodeIds = new Set(serialized
    .filter((item) => item?.__type__ === 'cc.Button')
    .map((item) => item.node?.__id__));
  for (const id of buttonNodeIds) {
    assert.match(serialized[id]._name, /^Btn_[A-Z][A-Za-z0-9]*$/, `button node ${id} must use Btn_`);
  }

  for (const parent of nodes) {
    const childNames = (parent._children ?? []).map((child) => serialized[child.__id__]?._name);
    assert.equal(new Set(childNames).size, childNames.length, `duplicate child name under ${parent._name}`);
  }
});

test('dissolve controller addresses the embedded CommonRoom dialog with canonical paths', () => {
  const controller = readFileSync(
    join(clientRoot, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkDissolveController.ts'),
    'utf8',
  );
  const coordinator = readFileSync(switchCoordinatorPath, 'utf8');
  assert.doesNotMatch(coordinator, /room\/DissolveRoom/);
  assert.match(coordinator, /CommonRoomNodePath\.dissolveRoom/);
  for (const path of [
    'Bg_Header/Btn_Close', 'Btn_Reject', 'Btn_Agree',
    'Content/Message/Label', 'Content/Countdown/Lb_Time',
    'PlayerList/PlayerItem_', 'Icon_Agreed', 'Icon_Rejected',
  ]) assert.ok(controller.includes(path), `missing embedded dissolve path: ${path}`);
});

test('room prefab and controller do not expose the removed WeChat share entry', () => {
  const serialized = JSON.parse(readFileSync(sharedRoomPath, 'utf8'));
  const waitingId = serialized.findIndex((item) => item?.__type__ === 'cc.Node' && item._name === 'WaitingActions');
  const waitingChildren = serialized[waitingId]._children.map((item) => serialized[item.__id__]?._name);
  assert.equal(waitingChildren.includes('ShareButton'), false);
  assert.equal(waitingChildren.includes('WechatInviteButton'), false);
  const moreItems = serialized.find((item) => item?.__type__ === 'cc.Node' && item._name === 'MoreItems');
  const moreChildren = moreItems._children.map((item) => serialized[item.__id__]?._name);
  assert.equal(moreChildren.includes('WechatButton'), false);

  const controller = readFileSync(adapterPath, 'utf8');
  assert.doesNotMatch(controller, /CommonRoomNodePath\.(shareButton|wechatInviteButton)/);
  assert.doesNotMatch(controller, /shareRoomToWechat/);
});

test('room implementation is split by presentation responsibility', () => {
  for (const file of ['RoomViewBindings.ts', 'SeatPresenter.ts', 'CardPresenter.ts', 'OperationPresenter.ts', 'AnimationPresenter.ts', 'RoomLifecycleController.ts']) {
    assert.doesNotThrow(() => readFileSync(join(runtimeRoot, file), 'utf8'));
  }
  const adapter = readFileSync(adapterPath, 'utf8');
  assert.match(adapter, /new RoomViewBindings/);
  assert.match(adapter, /new SeatPresenter/);
  assert.match(adapter, /new CardPresenter/);
  assert.match(adapter, /new OperationPresenter/);
  assert.match(adapter, /new AnimationPresenter/);
  assert.match(adapter, /new RoomLifecycleController/);
  assert.doesNotMatch(adapter, /legacy-ui\/assets\/njpdk/);
});

test('2/3/4 seat mapping is server-count driven and public code has no regional branches', () => {
  const seats = readFileSync(join(runtimeRoot, 'SeatPresenter.ts'), 'utf8');
  assert.match(seats, /2: Object\.freeze\(\[0, 2\]\)/);
  assert.match(seats, /3: Object\.freeze\(\[0, 1, 3\]\)/);
  assert.match(seats, /4: Object\.freeze\(\[0, 1, 2, 3\]\)/);
  const publicCode = ['SeatPresenter.ts', 'CardPresenter.ts', 'OperationPresenter.ts', 'AnimationPresenter.ts']
    .map((file) => readFileSync(join(runtimeRoot, file), 'utf8')).join('\n');
  assert.doesNotMatch(publicCode, /内江|成都|四川|njpdk|xcpdk|gameId\s*===|regionCode/);
});

test('public room consumes authoritative common head, poker card and canonical room messages', () => {
  const seat = readFileSync(join(runtimeRoot, 'SeatPresenter.ts'), 'utf8');
  const card = readFileSync(join(runtimeRoot, 'CardPresenter.ts'), 'utf8');
  const lifecycle = readFileSync(join(runtimeRoot, 'RoomLifecycleController.ts'), 'utf8');
  assert.match(seat, /COMMON_ASSET_BUNDLE/);
  assert.match(seat, /COMMON_HEAD_ASSET/);
  assert.match(seat, /CommonHead/);
  assert.match(seat, /CommonHeadController/);
  assert.doesNotMatch(seat, /mount\.removeAllChildren\(\)/);
  assert.match(seat, /child\.name === 'CommonHead'/);
  assert.match(card, /Poker_Card_Factory/);
  assert.match(card, /addComponent\(Button\)/);
  assert.match(card, /Button\.EventType\.CLICK/);
  assert.match(card, /synchronizeLayout\(cards: readonly Node\[\]\)/);
  assert.doesNotMatch(card, /interactionLocks|isInteractionLocked/);
  const factory = readFileSync(join(clientRoot, 'assets/Games/Poker/Common/Code/Card/Poker_Card_Factory.ts'), 'utf8');
  assert.match(factory, /POKER_CARD_BUNDLE = 'poker-common'/);
  assert.match(factory, /Poker_Card/);
  assert.doesNotMatch(card + factory, /common-poker-card(?:['"]|\/)|poker_card\/card|legacy-ui\/assets\/njpdk\/texture\/new_poker/);
  assert.match(factory, /assets\.load\(POKER_CARD_ASSET, Prefab, bundle\)/);
  assert.doesNotMatch(card, /getChildByName\('card_00'\)/);
  for (const msgId of ['common.room.ready_req',
    'common.room.play_req', 'common.room.pass_req']) assert.match(lifecycle, new RegExp(msgId.replaceAll('.', '\\.')));
  assert.doesNotMatch(lifecycle, /common\.room\.unready_req/);
  assert.doesNotMatch(lifecycle, /common\.room\.start_req|public start\(/);
  assert.doesNotMatch(lifecycle, /CNJPDK|poker\.njpdk\.dispatch|common\.room\.dispatch/);
});

test('room adapter releases only its own listeners and seat mapping has one authority', () => {
  const adapter = readFileSync(adapterPath, 'utf8');
  const roomPos = readFileSync(join(clientRoot, 'assets/Games/Poker/PDK/Common/Code/Runtime/model/CommonPdkRoomPosManager.ts'), 'utf8');
  assert.match(adapter, /this\.view\?\.unbind\(this\.bound\)/);
  assert.doesNotMatch(adapter, /targetOff\(this\)/);
  assert.match(roomPos, /from ['"]\.\.\/Room\/SeatPresenter['"]/);
  assert.doesNotMatch(roomPos, /Runtime\/pdk\/PdkSeatLayoutProfile|from ['"].*\/pdk\/PdkSeatLayoutProfile/);
});

test('registry routes the logical room to the one public Creator bundle', () => {
  const registry = readFileSync(join(clientRoot, 'assets/Common/Code/Runtime/ui/GamePrefabRegistry.ts'), 'utf8');
  const pdkMeta = JSON.parse(readFileSync(join(commonRoot, '../..', 'PDK.meta'), 'utf8'));
  const commonMeta = JSON.parse(readFileSync(join(commonRoot, '../Common.meta'), 'utf8'));
  const prefabMeta = JSON.parse(readFileSync(join(commonRoot, 'Prefab.meta'), 'utf8'));
  assert.match(registry, /'pdk\/PDK_CommonRoom': \{ bundle: 'paodekuai-common', asset: 'Prefab\/PDK_CommonRoom' \}/);
  assert.doesNotMatch(registry, /pdk\/PaoDeKuaiRoom/);
  assert.match(registry, /'pdk\/PDK_CommonRoom':\s*\{\s*bundle:\s*'paodekuai-common'/);
  assert.notEqual(pdkMeta.userData.isBundle, true);
  assert.equal(commonMeta.userData.isBundle, true);
  assert.equal(commonMeta.userData.bundleName, 'paodekuai-common');
  assert.notEqual(prefabMeta.userData.isBundle, true);
});

test('public PDK room is not registered as a modal overlay', () => {
  const coordinator = readFileSync(switchCoordinatorPath, 'utf8');
  const roomRegistration = coordinator.match(/this\.forms\.register\(PDK_ROOM_FORM,\s*\{[\s\S]*?lifecycle:/)?.[0] ?? '';
  assert.match(roomRegistration, /modal:\s*false/);
  assert.doesNotMatch(roomRegistration, /pdk\/PaoDeKuaiRoom/);
});

test('authoritative hand projection fails closed and keeps card ids stable', () => {
  const adapter = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkAuthoritativeViewAdapter.ts'), 'utf8');
  const roomSet = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/model/CommonPdkRoomSet.ts'), 'utf8');
  const logic = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/logic/CommonPdkGameLogic.ts'), 'utf8');
  const adapterController = readFileSync(adapterPath, 'utf8');
  assert.match(adapter, /CommonPdk 权威座位\$\{pos\} cards 数组缺失/);
  assert.match(adapter, /currentTrick/);
  assert.match(adapter, /legacyOperationType/);
  assert.match(adapter, /isFirstOp/);
  assert.match(adapter, /opType/);
  assert.match(adapter, /operationDeadline/);
  assert.match(adapter, /remainingOperationSeconds/);
  assert.match(roomSet, /CommonPdk 权威 posInfo 缺失/);
  assert.match(roomSet, /CommonPdk 本家手牌数组缺失/);
  assert.match(logic, /this\.SortCardByMax\(this\.handCardList\);/);
  assert.doesNotMatch(logic, /TransformValueToC\(this\.handCardList\)|pokers\[j\]\s*=\s*pokers\[j\]\s*\+\s*500/);
  assert.doesNotMatch(adapterController, /TransformValueToS\(values\)/);
  assert.match(adapterController, /surface\.on\(Node\.EventType\.TOUCH_END, this\.onHandTouchEnd, this, true\)/);
});

test('public PDK hand interaction matches click toggle, drag range and auto-pass contracts', () => {
  const adapterController = readFileSync(adapterPath, 'utf8');
  assert.match(adapterController, /private async toggleCardAt\(index: number, capturedPointer = false\)/);
  assert.match(adapterController, /CheckSelected\(this\.logic\.GetHandCard\(\)\[index\]\)/);
  assert.match(adapterController, /DeleteCardSelected\(index \+ 1\)/);
  assert.match(adapterController, /SetCardSelected\(index \+ 1\)/);
  assert.match(adapterController, /surface\.on\(Node\.EventType\.TOUCH_START, this\.onHandTouchStart, this, true\)/);
  assert.match(adapterController, /surface\.on\(Node\.EventType\.TOUCH_MOVE, this\.onHandTouchMove, this, true\)/);
  assert.match(adapterController, /surface\.on\(Node\.EventType\.TOUCH_CANCEL, this\.onHandTouchCancel, this, true\)/);
  assert.match(adapterController, /surface\.on\(Node\.EventType\.TOUCH_END, this\.onHandTouchEnd, this, true\)/);
  assert.match(adapterController, /private previewDragSelection\(\)/);
  assert.match(adapterController, /private commitSmartDragSelection\(sample: HandPointerSample\)/);
  assert.match(adapterController, /this\.dragIndices\.add\(item\)/);
  assert.match(adapterController, /largestLegalPdkSubsets\(touched/);
  assert.match(adapterController, /UITransform\.prototype\.hitTest\.call\(transform, screenPoint, windowId\)/);
  assert.match(adapterController, /canvas\.addEventListener\('pointercancel'/);
  assert.match(adapterController, /canvas\.style\.touchAction = 'none'/);
  assert.match(adapterController, /const seats = this\.seats/);
  assert.match(adapterController, /this\.cards\.synchronizeLayout\(this\.cardNodes\)/);
  assert.match(adapterController, /this\.logic\.SetCardData\(opType, cardList\)/);
  assert.match(adapterController, /this\.logic\.GetTipCard\(\)/);
  assert.match(adapterController, /if \(tips\.length > 0\)/);
  assert.match(adapterController, /await this\.pass\(\)/);
  assert.match(adapterController, /this\.autoPassInFlight/);
});

test('public PDK controller refreshes seats, public cards and deadline clock from authority pushes', () => {
  const adapterController = readFileSync(adapterPath, 'utf8');
  assert.match(adapterController, /renderHeads\(\)\.catch/);
  assert.match(adapterController, /renderHead\(entry\.dataSeat, entry\.physicalSlot, player/);
  assert.match(adapterController, /this\.setRemainingCardCount\(entry\.physicalSlot, count\)/);
  assert.match(adapterController, /Players\/Play_\$\{physicalSlot\}\/Head\/RemainingCount/);
  assert.match(adapterController, /restorePublicCards\(setInfo\)/);
  assert.match(adapterController, /startClockFromSetInfo\(setInfo\)/);
  assert.match(adapterController, /deadlineEpochMillis/);
  assert.match(adapterController, /Players\/Play_\$\{entry\.physicalSlot\}\/Clock\/Num/);
  assert.doesNotMatch(adapterController, /start\(\s*this\.roomId\(\)/);
});

test('round settlement distinguishes one round finished from whole match finished', () => {
  const adapter = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkAuthoritativeViewAdapter.ts'), 'utf8');
  const result = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkResultController.ts'), 'utf8');
  assert.match(adapter, /const matchFinished = Boolean\(source\.matchFinished\)/);
  assert.match(adapter, /canContinue/);
  assert.match(result, /private matchFinished\(\): boolean/);
  assert.match(result, /Authority 的 FINISHED 表示“一局结束”/);
  assert.doesNotMatch(result, /Number\(room\.GetRoomProperty\('state'\)\)\s*===\s*2/);
});

test('PDK round history is collected from authority before modal presentation filtering', () => {
  const result = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkResultController.ts'), 'utf8');
  const coordinator = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts'), 'utf8');
  assert.match(result, /public recordSettlement\(payload: Record<string, unknown>\)/);
  assert.match(result, /settlementHistory\.set\(roundNo, payload\)/);
  assert.match(result, /availableRounds:/);
  const record = coordinator.indexOf('this.resultController?.recordSettlement(payload)');
  const duplicateGate = coordinator.indexOf("if (key === this.settlementPendingKey || key === this.settlementShownKey) return;");
  assert.ok(record >= 0 && duplicateGate >= 0 && record < duplicateGate);
  assert.match(coordinator, /latestSetEnd[\s\S]*recordSettlement\(payload\)/);
  assert.match(result, /loadSettlementHistory\(roomId\)/);
  assert.match(result, /stage: 'HYDRATED'/);
  assert.match(result, /pointList,[\s\S]*totalPointList: \[\.\.\.totals\]/);
  const sceneRouter = readFileSync(join(clientRoot,
    'assets/Login/Code/Navigation/SceneRouter.ts'), 'utf8');
  const lobby = readFileSync(join(clientRoot,
    'assets/Lobby/Code/LobbyScreenController.ts'), 'utf8');
  assert.match(sceneRouter, /roomId => gateway\.historyDetail\(roomId\)/);
  assert.match(lobby, /roomId => hallRoomGateway\.historyDetail\(roomId\)/);
  assert.match(result, /if \(previous\) previous\.interactable = currentIndex > 0/);
  assert.match(result, /if \(next\) next\.interactable = currentIndex >= 0 && currentIndex < rounds\.length - 1/);
});

test('PDK small settlement renders authoritative remaining cards with the common card prefab', () => {
  const result = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkResultController.ts'), 'utf8');
  assert.match(result, /new CardPresenter\(\)/);
  assert.match(result, /RemainingCards\/RemainingCardPanel\/RemainingCardList/);
  assert.match(result, /this\.cards\.clear\(parent\)/);
  assert.match(result, /this\.cards\.create\(parent, value\)/);
  assert.match(result, /surplusCardList/);
  assert.match(result, /remainCards/);
  assert.match(result, /remainingCount > 0/);
  assert.doesNotMatch(result, /Array\.from\(\{ length: Math\.max\(0, Number\(value/);
});
