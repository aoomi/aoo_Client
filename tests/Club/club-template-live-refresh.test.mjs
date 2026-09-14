import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const main = readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyClubMainController.ts', import.meta.url), 'utf8');
const management = readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyClubRoomManagementController.ts', import.meta.url), 'utf8');
const protocol = readFileSync(new URL('../../assets/Common/Code/Runtime/network/ProtocolClient.ts', import.meta.url), 'utf8');

test('club lobby reloads authoritative templates for cross-user template mutations', () => {
    assert.match(main, /'club\.room_templates_changed'/);
    assert.match(main, /refreshRoomsFromTemplatePush\(body\)/);
    assert.match(main, /restoreAuthoritativeTemplates\(this\.clubId\(\), '俱乐部模板推送刷新'\)/);
});

test('open room management reloads after a scope-only mutation notification', () => {
    assert.match(management, /'club\.room_templates_changed'/);
    assert.match(management, /if \(!event\.clubCreateGameSets && !event\.clubCreateGameSet\) \{ void this\.load\(\); return; \}/);
});

test('template invalidation keeps its own route instead of waking every club listener', () => {
    assert.match(protocol, /event === 'club\.room_templates_changed'/);
});
