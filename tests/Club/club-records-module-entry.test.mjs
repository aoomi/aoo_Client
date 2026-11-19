import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relative => fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

test('club record buttons delegate opening to the Records module', () => {
    const club = read('assets/Club/Code/Runtime/LegacyClubMainController.ts');
    const records = read('assets/Modules/Records/Code/ReplayController.ts');
    const registry = read('assets/Common/Code/Runtime/ui/ModulePrefabRegistry.ts');

    assert.match(club, /Btn_Record[^]*openClubRecord\(\)/);
    assert.match(club, /Btn_EventRecord[^]*openClubRecord\(\)/);
    assert.match(club, /mainNode\.emit\('legacy-open-records', \{ source: 'CLUB', clubId: this\.clubId\(\) \}\)/);
    assert.doesNotMatch(club, /openClubRecord\(\): void \{[^}]*forms\.show\('UILobbyRecords'/);
    assert.match(records, /this\.on\('legacy-open-records', value => \{ void this\.open\(value\); \}\)/);
    assert.match(records, /this\.api\.history\([\s\S]*this\.historyClubId/);
    assert.match(records, /const form = await this\.forms\.show\('UILobbyRecords'\)/);
    assert.match(registry, /UILobbyRecords: \{ bundle: 'records-ui', asset: 'Prefab\/Records' \}/);
});
