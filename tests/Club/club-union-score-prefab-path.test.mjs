import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const main = read('assets/Club/Code/Runtime/LegacyClubMainController.ts');
const manager = read('assets/Club/Code/Runtime/LegacyUnionZhongzhiManagerController.ts');
const rank = read('assets/Club/Code/Runtime/LegacyUnionZhongzhiRankController.ts');
const map = JSON.parse(read('assets/Common/Config/NativeMaps/prefab-path-map.json'));

for (const name of ['Skin2UnionManagerZhongZhi', 'Skin2UnionRankZhongZhi']) {
    assert.ok(existsSync(new URL(`assets/Club/Prefab/${name}.prefab`, root)), `${name} prefab must exist`);
    assert.ok(existsSync(new URL(`assets/Club/Prefab/${name}.prefab.meta`, root)), `${name} meta must exist`);
    assert.equal(map[`ui/club_2/${name}.prefab`], `native-ui/club/skin-2/${name}`);
}

assert.ok(main.includes("forms.show('ui/club_2/Skin2UnionManagerZhongZhi')"));
assert.ok(manager.includes("forms.register('ui/club_2/Skin2UnionManagerZhongZhi'"));
assert.ok(rank.includes("forms.register('ui/club_2/Skin2UnionRankZhongZhi'"));
for (const source of [main, manager, rank]) {
    assert.doesNotMatch(source, /ui\/club_2\/UIUnion(?:Manager|Rank)ZhongZhi/);
}

console.log('club union score prefab paths passed');
