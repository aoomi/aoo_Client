import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('club player statistics is owned and loaded by the Records bundle', () => {
    assert.equal(
        fs.existsSync(new URL('../../assets/Club/Prefab/ClubPlayerLog.prefab', import.meta.url)),
        false,
        'the old Club prefab copy must not remain',
    );
    assert.equal(
        fs.existsSync(new URL('../../assets/Modules/Records/Prefab/ClubPlayerLog.prefab', import.meta.url)),
        true,
        'the statistics prefab must live in the Records bundle',
    );

    const registry = read('assets/Common/Code/Runtime/ui/ModulePrefabRegistry.ts');
    assert.match(registry, /ClubPlayerLog:\s*\{\s*bundle:\s*'records-ui',\s*asset:\s*'Prefab\/ClubPlayerLog'\s*\}/);

    const nativeMap = JSON.parse(read('assets/Common/Config/NativeMaps/prefab-path-map.json'));
    assert.equal(nativeMap['ui/club/ClubPlayerLog.prefab'], 'Modules/Records/Prefab/ClubPlayerLog');

    const trigger = read('assets/Club/Code/Runtime/LegacyClubRecordUserDayController.ts');
    assert.match(trigger, /forms\.show\('ui\/club\/ClubPlayerLog',\s*this\.clubId,\s*this\.unionId\)/);
});
