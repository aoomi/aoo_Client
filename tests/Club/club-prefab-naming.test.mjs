import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const renamed = {
    ClubFindRoom: 'ClubFind', ClubForbid: 'ClubBan', ClubManagerNew: 'ClubManage',
    ClubMessage: 'ClubMsg', ClubPlayerRecord: 'ClubPlayerLog', ClubRoomList: 'ClubRooms',
    ClubRoomWanFa: 'ClubRule', ClubUserList: 'ClubMembers',
    PromoterAllManager: 'ClubPromoters', PromoterSet: 'ClubPromoterSet',
    PromoterShowSetting: 'ClubPromoterView',
};
const forbiddenNodes = new Set([
    'New Label', 'New Sprite', 'BACKGROUND_SPRITE', 'TEXT_LABEL',
    'PLACEHOLDER_LABEL', 'RICHTEXT_CHILD', 'tip copy', 'user1', 'user2',
]);

test('listed Club prefabs use Club-prefixed concise asset and root names', () => {
    for (const [oldName, name] of Object.entries(renamed)) {
        const path = new URL(`assets/Club/Prefab/${name}.prefab`, root);
        const metaPath = new URL(`assets/Club/Prefab/${name}.prefab.meta`, root);
        assert.ok(fs.existsSync(path), `missing renamed prefab ${name}`);
        assert.ok(fs.existsSync(metaPath), `missing renamed meta ${name}`);
        assert.ok(!fs.existsSync(new URL(`assets/Club/Prefab/${oldName}.prefab`, root)), `legacy prefab remains ${oldName}`);
        const prefab = JSON.parse(fs.readFileSync(path, 'utf8'));
        const nodes = prefab.filter((item) => item?.__type__ === 'cc.Node');
        assert.equal(nodes[0]?._name, name, `${name} root mismatch`);
        for (const node of nodes) assert.ok(!forbiddenNodes.has(node._name), `${name} keeps default node ${node._name}`);
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        assert.equal(meta.userData?.syncNodeName ?? meta.subMetas?.['']?.syncNodeName, name, `${name} meta root mismatch`);
    }
});

test('renamed form paths resolve to the renamed native assets', () => {
    const map = JSON.parse(fs.readFileSync(new URL('assets/Common/Config/NativeMaps/prefab-path-map.json', root), 'utf8'));
    for (const name of Object.values(renamed)) {
        assert.equal(map[`ui/club/${name}.prefab`], `native-ui/club/default/${name}`,
            `missing renamed mapping for ${name}`);
    }
});

test('Club prefab directory belongs to the parent Club bundle', () => {
    const meta = JSON.parse(fs.readFileSync(new URL('assets/Club/Prefab.meta', root), 'utf8'));
    assert.equal(meta.userData?.isBundle, undefined);
    assert.equal(meta.userData?.bundleName, undefined);
});
