import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(here, '../..');
const read = (relative) => fs.readFileSync(path.join(clientRoot, relative), 'utf8');

function prefabPaths(relative) {
    const prefab = JSON.parse(read(relative));
    const rootId = prefab[0]?.data?.__id__;
    assert.ok(Number.isInteger(rootId), `${relative} root id missing`);
    const paths = new Set();
    const walk = (id, prefix = '') => {
        const node = prefab[id];
        if (node?.__type__ !== 'cc.Node') return;
        const current = prefix ? `${prefix}/${node._name}` : node._name;
        paths.add(current);
        for (const child of node._children ?? []) walk(child.__id__, current);
    };
    walk(rootId);
    const rootName = prefab[rootId]._name;
    return new Set([...paths].map((entry) => entry === rootName ? '' : entry.slice(rootName.length + 1)));
}

test('club safe-box entry uses ClubSafePanel and removes the CaseSprots runtime contract', () => {
    const main = read('assets/Club/Code/Runtime/LegacyClubMainController.ts');
    const nativeMap = JSON.parse(read('assets/Common/Config/NativeMaps/prefab-path-map.json'));

    assert.match(main, /register\('ui\/club\/UIClubSafePanel'/);
    assert.match(main, /forms\.show\('ui\/club\/UIClubSafePanel'\)/);
    assert.match(main, /new ClubBoxController\(/);
    assert.match(main, /new ClubBoxGateway\(this\.client\)/);
    assert.match(main, /this\.forms\.loadCommonNumpad\(\)/);
    assert.doesNotMatch(main, /UICaseSprots|CClubGetCaseSprotsChange|PLEditBox|bindCaseSports|changeCaseSports/);
    assert.equal(nativeMap['ui/club/UIClubSafePanel.prefab'], 'native-ui/club/default/ClubSafePanel');
    assert.equal(nativeMap['ui/club/UIClubBox.prefab'], undefined);
    assert.equal(nativeMap['ui/club/UICaseSprots.prefab'], undefined);
});

test('ClubSafePanel controller paths match the authored prefab', () => {
    const nodes = prefabPaths('assets/Club/Prefab/ClubSafePanel.prefab');
    for (const required of [
        'Panel/Header/Close',
        'Body/Balance/Summary/Carry/Value',
        'Body/Balance/Summary/Vault/Value',
        'Body/Balance/Store',
        'Body/Balance/Withdraw',
        'Body/History/List',
        'Body/History/List/View/Content/Item',
        'Body/History/List/View/Content/Item/User/Profile/Id',
        'Body/History/List/View/Content/Item/User/Profile/Name',
        'Body/History/List/View/Content/Item/Action/Store',
        'Body/History/List/View/Content/Item/Action/Withdraw',
        'Body/History/List/View/Content/Item/Amount/In',
        'Body/History/List/View/Content/Item/Amount/Out',
        'Body/History/List/View/Content/Item/Time',
    ]) assert.ok(nodes.has(required), `ClubSafePanel prefab node missing: ${required}`);
});
