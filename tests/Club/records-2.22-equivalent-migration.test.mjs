import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');

test('active 2.22 records screens are owned by the Records bundle', () => {
    for (const name of ['Records', 'ClubStats', 'UserRecord', 'ClubPlayerLog']) {
        assert.equal(fs.existsSync(new URL(`assets/Modules/Records/Prefab/${name}.prefab`, root)), true, name);
    }
    const registry = read('assets/Common/Code/Runtime/ui/ModulePrefabRegistry.ts');
    assert.match(registry, /UIClubStats:\s*\{\s*bundle:\s*'records-ui',\s*asset:\s*'Prefab\/ClubStats'\s*\}/);
});

test('ClubStats has no copied XQP script component and uses authoritative data', () => {
    const prefab = read('assets/Modules/Records/Prefab/ClubStats.prefab');
    assert.doesNotMatch(prefab, /fd25aCeAvxD77t\/XvWWq3R0|53695czwFBODaBhIjc\/zETd/);
    const controller = read('assets/Modules/Records/Code/ClubStatsController.ts');
    assert.match(controller, /'club\.CClubSChoolReport'/);
    assert.match(controller, /'ui\/club\/UIClubRecordUser'/);
    assert.match(controller, /for \(let pageNum = 1; pageNum <= totalPages; pageNum \+= 1\)/);
});

test('club record statistics button enters ClubPlayerLog with club context', () => {
    const controller = read('assets/Modules/Records/Code/ReplayController.ts');
    assert.match(controller, /click\(form\.node, 'Btn_Stats'/);
    assert.match(controller, /forms\.show\(\s*'ui\/club\/ClubPlayerLog', this\.historyClubId, this\.historyUnionId/);
    assert.doesNotMatch(controller, /Btn_Stats'[\s\S]{0,180}forms\.show\('UIClubStats'/);
});
