import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const controllerPath = new URL('../../assets/Club/Code/Runtime/LegacyClubMainController.ts', import.meta.url);
const prefabPath = new URL('../../assets/Club/Prefab/ClubMain.prefab', import.meta.url);
const controller = fs.readFileSync(controllerPath, 'utf8');
const prefab = fs.readFileSync(prefabPath, 'utf8');

test('ClubMain uses the current two-level game and room tab hierarchy', () => {
    assert.match(prefab, /"_name": "GameTabs"/);
    assert.match(prefab, /"_name": "RoomTabs"/);
    assert.doesNotMatch(prefab, /"_name": "PlayList"/);
    assert.match(controller, /this\.findMainNode\(form, 'GameTabs'\)/);
    assert.match(controller, /this\.findMainNode\(form, 'RoomTabs'\)/);
    assert.doesNotMatch(controller, /findDescendant\(filter, 'PlayList'\)/);
    assert.doesNotMatch(controller, /全部玩法/);
});

test('game tabs group templates by stable game and room tabs use configured room names', () => {
    assert.match(controller, /games\.set\(this\.gameFilterKey\(room\), room\)/);
    assert.match(controller, /this\.setLabel\(item, 'Label', this\.gameDisplayName\(room\)\)/);
    assert.match(controller, /item\.name = `Btn_Game_\$\{key\.replace[\s\S]*?item\.active = true/);
    assert.match(controller, /this\.setLabel\(item, 'Label', this\.roomDisplayName\(room\)\)/);
    assert.match(controller, /this\.setLabel\(allGame, 'Label', '全部'\)/);
    assert.match(controller, /gameContent\.addChild\(allGame\)/);
    assert.match(controller, /this\.setLabel\(roomTemplate, 'Label', '全部'\)/);
    assert.match(controller, /gameRooms\.filter\(\(room\) => this\.sameRoomTemplate/);
});

test('Btn_Play has distinct placeholder selected and unselected visuals', () => {
    const data = JSON.parse(prefab);
    const roomTab = data.find((entry) => entry?._name === 'RoomTabs');
    const content = data[roomTab._children[0].__id__]._children
        .map((child) => data[child.__id__]).find((entry) => entry?._name === 'Content');
    const button = content._children.map((child) => data[child.__id__])
        .find((entry) => entry?._name === 'Btn_Play');
    assert.deepEqual(button._children.map((child) => data[child.__id__]._name), ['NoSelect', 'YesSelect', 'Label']);
    const toggle = button._components.map((component) => data[component.__id__])
        .find((component) => component?.__type__ === 'cc.Toggle');
    assert.equal(data[toggle._checkMark.__id__].node.__id__, button._children[1].__id__);
    assert.match(controller, /node\.name === 'Btn_Play' \|\| node\.name\.startsWith\('Btn_Play_'\)/);
    assert.match(controller, /new Color\(111, 57, 12, 255\)/);
    assert.match(controller, /new Color\(255, 255, 255, 255\)/);
    assert.match(controller, /noSelect\.active = !selected/);
    assert.match(controller, /yesSelect\.active = selected/);
    assert.match(controller, /selectToggle\.isChecked = selected/);
});

test('game tab selection is cached only for the current player and club session', () => {
    assert.match(controller, /const CLUB_GAME_TAB_SESSION_CACHE = new Map<string, string>\(\)/);
    assert.match(controller, /return `\$\{this\.playerId\}:\$\{this\.clubId\(\)\}`/);
    assert.match(controller, /this\.selectedGameFilter = this\.cachedGameTabSelection\(\)/);
    assert.match(controller, /this\.saveGameTabSelection\(''\)/);
    assert.match(controller, /this\.saveGameTabSelection\(key\)/);
    assert.doesNotMatch(controller, /localStorage[^\n]*GameTab|sys\.localStorage[^\n]*GameTab/);
    assert.match(controller, /\[ClubRoomTabs\] restore-game-selection/);
    assert.match(controller, /\[ClubRoomTabs\] cache-game-selection/);
});

test('Btn_Tabs toggles FavoriteList and an outside tap closes it', () => {
    assert.match(prefab, /"_name": "Btn_Tabs"/);
    assert.match(prefab, /"_name": "FavoriteList"/);
    assert.match(controller, /Btn_Tabs: 'GameTabs\/FavoriteList\/Btn_Tabs'/);
    assert.match(controller, /this\.onClick\(tabsButton, \(\) => this\.setFavoriteTabsOpen\(!this\.favoriteTabsOpen\)\)/);
    assert.match(controller, /form\.node\.on\(Node\.EventType\.TOUCH_END, closeFavoriteTabs, this, true\)/);
    assert.match(controller, /form\.node\.off\(Node\.EventType\.TOUCH_END, closeFavoriteTabs, this, true\)/);
    assert.match(controller, /this\.nodeContains\(gameTabs, event\.target as Node\)/);
    assert.match(controller, /Tween\.stopAllByTarget\(favoriteList\)/);
    assert.match(controller, /tween\(favoriteList\)\.to\(0\.2/);
    assert.match(controller, /Tween\.stopAllByTarget\(roomTabs\)/);
    assert.match(controller, /tween\(roomTabs\)\.to\(0\.2/);
    assert.match(controller, /this\.roomTabsClosedX \+ \(open \? width : 0\)/);
});

test('the GameTabs container does not intercept RoomTabs child button clicks', () => {
    assert.match(controller, /const gameTabs = node\('GameTabs'\)/);
    assert.match(controller, /const gameTabsButton = gameTabs\?\.getComponent\(Button\) \?\? null/);
    assert.match(controller, /if \(gameTabsButton\) gameTabsButton\.enabled = false/);
});

test('the RoomTabs all button clears only the room filter and renders every desk in the selected game', () => {
    assert.match(controller, /roomTemplate\.on\(Button\.EventType\.CLICK, selectAllRooms\)/);
    assert.match(controller, /roomTemplate\.off\(Button\.EventType\.CLICK, selectAllRooms\)/);
    assert.match(controller, /private showAllRoomsForSelectedGame\(\): void \{[\s\S]*?this\.selectedRoomFilter = null/);
    assert.match(controller, /selectedGameFilter[\s\S]*?this\.renderRoomTabs\(\);[\s\S]*?this\.renderRooms\(\)/);
    assert.match(controller, /\[ClubRoomTabs\] select-all-rooms/);
});

test('active desks inherit the stable regional game code from their room template', () => {
    assert.match(controller, /Number\(room\.roomId \?\? room\.roomID \?\? 0\) > 0/);
    assert.match(controller, /Number\(candidate\.roomId \?\? candidate\.roomID \?\? 0\) <= 0/);
    assert.match(controller, /this\.sameRoomTemplate\(room, candidate\)/);
    assert.match(controller, /const templateGameCode = this\.resolveCatalogGameCode\(template\)/);
    assert.match(controller, /if \(templateGameCode\) return templateGameCode/);
});
