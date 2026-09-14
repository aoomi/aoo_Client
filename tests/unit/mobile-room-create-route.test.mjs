import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const gateway = fs.readFileSync(path.join(root, 'assets/Lobby/Code/HallRoomGateway.ts'), 'utf8');
const selector = fs.readFileSync(path.join(root, 'assets/Modules/CreateRoom/Code/PlaySelectorController.ts'), 'utf8');
const launcher = fs.readFileSync(path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkGameSceneLauncher.ts'), 'utf8');
const endpoints = fs.readFileSync(path.join(root, 'assets/Common/Code/Runtime/config/RuntimeEndpoints.ts'), 'utf8');
const router = fs.readFileSync(path.join(root, 'assets/Login/Code/Navigation/SceneRouter.ts'), 'utf8');
const lobby = fs.readFileSync(path.join(root, 'assets/Lobby/Code/LobbyScreenController.ts'), 'utf8');

test('desktop and LAN room creation use the current-page canonical Gateway', () => {
  assert.match(gateway, /const canonicalRoute = resolveRuntimeEndpoints\(\)\.hallWebSocketUrl/);
  assert.match(gateway, /authorityRoute: canonicalRoute/);
  assert.match(endpoints, /testPreviewGatewayOrigin/);
  assert.doesNotMatch(gateway, /userAgent|navigator\./);
});

test('one mutation completes room route and ticket before scene handoff', () => {
  assert.match(gateway, /if \(this\.pending\) return this\.pending/);
  assert.match(gateway, /await this\.api\.mutate[\s\S]*return this\.handoff/);
  assert.match(gateway, /const ticket = issuedTicket \?\? await this\.issueRoomTicket/);
  assert.match(gateway, /const \[prepared, ticket\] = await Promise\.all\(\[/);
  assert.match(selector, /const handoff = await this\.gateway\.create[\s\S]*await this\.onCreated/);
  assert.match(launcher, /load-room-scene[\s\S]*mount-room-runtime/);
});

test('failed handoff keeps the create form and transport mutations are never retried', () => {
  assert.match(selector, /if \(this\.forms\.isAlive\(\)\) this\.fail/);
  assert.match(selector, /this\.submitting/);
});

test('create cannot submit before the authoritative rule schema is ready', () => {
  assert.match(selector, /private rulesReady = false/);
  assert.match(selector, /this\.presenter\?\.setSchema[\s\S]*this\.rulesReady = true/);
  assert.match(selector, /!this\.rulesReady\) \{ this\.message\('房间规则尚未加载完成'\)/);
  assert.match(selector, /button\.interactable = this\.rulesReady && !busy/);
});

test('room return is committed by the shared SceneRouter before lobby remount', () => {
  assert.match(launcher, /this\.navigateToLobby \? this\.navigateToLobby\(target\) : this\.loadMainScene\(\)/);
  assert.match(router, /private async returnFromRoom[\s\S]*presentLobbyScene\(account, role, operationId,/);
  assert.match(router, /target => this\.returnFromRoom\(account, role, target\)/);
  assert.match(lobby, /this\.navigateToLobby/);
});
