import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..', '..');
const source = (path) => readFileSync(join(root, path), 'utf8');

test('room creation pins the exact configuration revision rendered by the selector', () => {
  const selector = source('assets/Modules/CreateRoom/Code/PlaySelectorController.ts');
  const gateway = source('assets/Lobby/Code/HallRoomGateway.ts');
  assert.match(selector, /this\.gateway\.create\(selectedGame\.gameCode, submittedRules,[\s\S]*?configurationRevision\)/);
  assert.match(gateway, /classificationRegionCode: configuration\.classificationRegionCode,[\s\S]*?releaseId: Number\(configuration\.releaseId\),[\s\S]*?indexGeneration: Number\(configuration\.indexGeneration\),[\s\S]*?sourceHash: String\(configuration\.ui\.roomRuleSourceHash\)/);
  assert.match(gateway, /configuration\.classificationRegionCode !== selected\.classificationRegionCode/);
});

test('room preparation and active recovery consume the room-pinned configuration', () => {
  const gateway = source('assets/Lobby/Code/HallRoomGateway.ts');
  assert.match(gateway, /const configuration = room\.configuration;[\s\S]*?configuration\.classificationRegionCode !== room\.classificationRegionCode[\s\S]*?configuration,\s*\};/);
  assert.match(gateway, /configuration: room\.configuration/);
  assert.match(gateway, /configuration: active\.configuration/);
  assert.match(gateway, /room\.configuration\.classificationRegionCode !== room\.classificationRegionCode/);
});

test('creator uses canonical rules and UI returned with the committed room', () => {
  const gateway = source('assets/Lobby/Code/HallRoomGateway.ts');
  assert.match(gateway, /if \(!room\.rules \|\| !room\.configuration\)/);
  assert.match(gateway, /return this\.handoff\(\{ \.\.\.room, rules: room\.rules \}, gameCode, selected\.familyCode, room\.configuration\.ui\)/);
});
