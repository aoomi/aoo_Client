import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relative => fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

test('club record buttons delegate opening to the Records module', () => {
    const club = read('assets/Club/Code/Runtime/LegacyClubMainController.ts');
    const records = read('assets/Modules/Records/Code/ReplayController.ts');
    const registry = read('assets/Common/Code/Runtime/ui/ModulePrefabRegistry.ts');

    assert.match(club, /bottom\/btn_zhanji[^]*openClubRecord\(\)/);
    assert.match(club, /top\/right_btn\/btn_unionRecord[^]*openClubRecord\(\)/);
    assert.match(club, /mainNode\.emit\('legacy-open-records'/);
    assert.doesNotMatch(club, /openClubRecord\(\): void \{[^}]*forms\.show\('UILobbyRecords'/);
    assert.match(records, /this\.on\('legacy-open-records', \(\) => \{ void this\.open\(\); \}\)/);
    assert.match(records, /const form = await this\.forms\.show\('UILobbyRecords'\)/);
    assert.match(registry, /UILobbyRecords: \{ bundle: 'records-ui', asset: 'Prefab\/Records' \}/);
});
