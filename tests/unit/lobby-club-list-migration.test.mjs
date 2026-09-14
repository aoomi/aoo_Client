import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relative => fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

test('lobby club list owns only the nodes present in LobbyClubList prefab', () => {
    const entry = read('assets/Lobby/Code/ClubList/LobbyClubEntryController.ts');
    const list = read('assets/Lobby/Code/ClubList/LobbyClubListController.ts');
    const lobby = read('assets/Lobby/Code/LobbyScreenController.ts');
    const registry = read('assets/Common/Code/Runtime/ui/ModulePrefabRegistry.ts');

    for (const path of [
        'Popup/Back', 'Body/Actions/Create', 'Body/Actions/Join', 'Body/List/View/Content',
        'Photo/FrameBox/Mask/Avatar', 'Actions/Pin', 'Actions/Enter',
    ]) assert.match(list, new RegExp(path.replaceAll('/', '\\/')));

    for (const retired of ['UIClubList', 'UIClubNone', 'btn_zuo', 'btn_you', 'rightTop/', 'userinfo/', 'lb_gamelist']) {
        assert.doesNotMatch(`${entry}\n${list}`, new RegExp(retired));
    }
    assert.match(entry, /forms\.register\('UILobbyClubList'/);
    assert.match(entry, /forms\.register\('UILobbyClubList',[\s\S]{0,180}zOrder: 8/);
    const enterClub = entry.slice(entry.indexOf('private async enterClub'));
    assert.ok(
        enterClub.indexOf('await this.forms.show(path') < enterClub.indexOf("this.forms.close('UILobbyClubList')"),
        'club target must mount before the list is closed so the game lobby is never exposed',
    );
    assert.ok(
        enterClub.indexOf('restoreAuthoritativeTemplates') < enterClub.indexOf("this.forms.close('UILobbyClubList')"),
        'the authoritative club desks must hydrate while the source list still covers the target',
    );
    assert.match(entry, /this\.mainNode\.active = !this\.isClubMainVisible\(\)/);
    assert.match(entry, /if \(!clubForm\?\.isShown\(\)\) throw new Error\('俱乐部界面未完成挂载'\)/);
    for (const path of [
        'CreatecCub', 'CreatecCub/Create/Found/EditBox', 'Create/Confirm', 'Popup/Tag/Close',
    ]) assert.match(entry, new RegExp(path.replaceAll('/', '\\/')));
    assert.doesNotMatch(entry, /ui\/club\/UIClubCreate/);
    assert.match(lobby, /\.\/ClubList\/LobbyClubEntryController/);
    assert.match(registry, /UILobbyClubList: \{ bundle: 'lobby', asset: 'Prefab\/ClubList' \}/);
    const gateway = read('assets/Lobby/Code/ClubList/LobbyClubListGateway.ts');
    assert.match(gateway, /'club\.CGetClubListMin'/);
    assert.match(gateway, /this\.detail\(clubId\)/);
    assert.doesNotMatch(list, /无职位|\.identity/);
    for (const position of ['管理/队长', '队长', '圈主', '管理', '成员']) assert.match(list, new RegExp(position));
    assert.equal(fs.existsSync(new URL('../../assets/Club/Code/Runtime/LegacyClubEntryController.ts', import.meta.url)), false);
});
