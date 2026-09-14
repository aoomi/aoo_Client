import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const controllerPath = new URL('../../assets/Club/Code/Runtime/LegacyClubMainController.ts', import.meta.url);
const prefabPath = new URL('../../assets/Club/Prefab/ClubDesk.prefab', import.meta.url);
const catalogPath = new URL('../../assets/Games/Common/Code/Catalog/CatalogFamilyBindings.ts', import.meta.url);

test('亲友圈模板桌加载 ClubDesk 并按权威类别、人数选择精确节点', () => {
    const source = fs.readFileSync(controllerPath, 'utf8');
    assert.match(source, /bundleName: 'club', assetPath: 'Prefab\/ClubDesk'/,
        '模板桌必须从父级 club Bundle 的 Prefab 目录加载');
    assert.match(source, /metadata\.category === 'MAHJONG' \? 'Square' : normalizedCount <= 5 \? 'Round' : 'Long'/);
    assert.match(source, /playersName: `Players_\$\{normalizedCount\}`/);
    assert.match(source, /for \(const value of \[room\.gameCode, room\.game_code, room\.gameId, room\.gameType, room\.gameName\]\)/);
    assert.match(source, /metadata\.gameId === gameId/);
    assert.match(source, /metadata\.displayName === text/);

    const catalog = fs.readFileSync(catalogPath, 'utf8');
    for (const code of ['CD201', 'NJ201', 'LS201']) {
        assert.match(catalog, new RegExp(`"${code}":\\{gameId:[^}]+category:"POKER"`));
    }

    const prefab = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
    const nodeNames = prefab
        .filter((entry) => entry?.__type__ === 'cc.Node')
        .map((entry) => entry._name);
    for (const name of ['ClubDesk', 'Square', 'Round', 'Long', 'Players_2', 'Players_3', 'Players_4']) {
        assert.ok(nodeNames.includes(name), `ClubDesk 缺少节点 ${name}`);
    }

    const rootId = prefab[0]?.data?.__id__;
    const child = (id, name) => (prefab[id]?._children ?? [])
        .map(reference => reference.__id__)
        .find(childId => prefab[childId]?._name === name);
    const variantsId = child(rootId, 'Variants');
    const roundId = child(variantsId, 'Round');
    assert.ok(child(roundId, 'Players_2') !== undefined,
        '凉山跑得快2人模板必须直接选中 ClubDesk/Variants/Round/Players_2');
    assert.equal(catalogMetadataFromSource(catalog, 'LS201').category, 'POKER');
});

function catalogMetadataFromSource(source, code) {
    const match = source.match(new RegExp(`"${code}":\\{gameId:(\\d+),displayName:"([^"]+)",category:"([^"]+)"`));
    assert.ok(match, `Catalog 缺少 ${code}`);
    return { gameId: Number(match[1]), displayName: match[2], category: match[3] };
}
