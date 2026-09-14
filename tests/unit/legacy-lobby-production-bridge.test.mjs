import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../assets/', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('production lobby entry routes legacy buttons only through new controllers', () => {
  const screen = read('Lobby/Code/LobbyScreenController.ts');
  assert.match(screen, /new LobbyModuleCoordinator/);
  for (const route of ['profile.open', 'store.open', 'replay.open', 'rank.open', 'task.open', 'location.open', 'luckDraw.open']) {
    assert.ok(screen.includes(`productionBridge?.${route}`), route);
  }
  assert.doesNotMatch(screen, /luckdraw\.CLuckDrawCheck|GetLuckGoods|popup\.CPopupList/);
});

test('optional support capability never blocks lobby startup and fails closed when enabled without an endpoint', () => {
  const bridge = read('Lobby/Code/LobbyModuleCoordinator.ts');
  assert.match(bridge, /config\.supportEnabled\s*&&\s*!config\.supportHttpUrl/);
  assert.match(bridge, /new DisabledSupportCapability\(forms\)/);
  assert.doesNotMatch(bridge, /if\(!config\?\.supportHttpUrl\)throw/);
  assert.doesNotMatch(bridge, /客服服务在当前环境未启用/);
});

test('HTTP boundary carries authentication, versioning, idempotency and lifecycle cancellation', () => {
  const api = read('Common/Code/Runtime/Activity/ProductionApiClient.ts');
  for (const contract of ['Authorization: `Bearer ${accessToken}`', 'currentAccessToken()', "'X-Player-Id'", "'Idempotency-Key'", 'AbortController', 'this.inflight', 'response.ok']) {
    assert.ok(api.includes(contract), contract);
  }
  assert.match(api, /resolveRuntimeEndpoints\(\)\.apiBaseUrl/);
  assert.match(api, /'X-Device-Id': endpoints\.deviceId/);
  assert.match(api, /refreshPending/);
  assert.match(api, /shouldRefresh/);
  assert.match(api, /shouldRefreshBeforeRequest/);
  assert.doesNotMatch(api, /legacy-cocos-client|legacy-lobby/);
  assert.match(api, /'X-Trace-Id': traceId/);
  assert.match(api, /ProductionApiError/);
});

test('lobby HTTP clients resolve the current rotated account token for every request', () => {
  const screen = read('Lobby/Code/LobbyScreenController.ts');
  const bridge = read('Lobby/Code/LobbyModuleCoordinator.ts');
  const room = read('Lobby/Code/HallRoomGateway.ts');
  assert.match(screen, /const accessToken = \(\) => this\.account\.accessToken \|\| this\.account\.token/);
  assert.match(screen, /const refreshAccessToken = \(\) => this\.refreshAccessToken\(\)/);
  assert.match(screen, /const shouldRefreshAccessToken = \(\) => this\.shouldRefreshAccessToken\(\)/);
  assert.match(screen, /accessExpiresAt/);
  assert.match(screen, /tokenExpiryMillis\(this\.account\.accessExpiresAt\)/);
  assert.match(screen, /typeof value === 'number' && Number\.isFinite\(value\)/);
  assert.match(screen, /numeric > 100000000000 \? numeric : numeric \* 1000/);
  assert.match(screen, /this\.account\.onSessionRotated\?\.\(\)/);
  assert.match(screen, /new HallRoomGateway\(\s*accessToken/);
  assert.match(screen, /new ProductionApiClient\(accessToken/);
  assert.match(bridge, /token: AccessTokenSource/);
  assert.match(bridge, /refreshSession\?: SessionRefresher/);
  assert.match(bridge, /shouldRefreshSession\?: SessionRefreshPolicy/);
  assert.match(room, /token: AccessTokenSource/);
});

test('gateways point at mounted production routes and replay version header', () => {
  const combined = [
    'Activity/ActivityGateway.ts', 'Activity/ProductionApiClient.ts', 'Ranking/RankingGateway.ts', 'Profile/ProfileGateway.ts',
    'Location/LocationGateway.ts', 'Inventory/InventoryGateway.ts', 'Replay/ReplayGateway.ts',
    'network/GatewayEntryPolicy.ts',
  ].map(path => read(`Common/Code/Runtime/${path}`)).join('\n');
  for (const route of ['/api/v2/activities', '/api/v2/rankings', '/api/v2/achievements', '/api/v2/player-profile', '/api/v2/location', '/api/v2/inventory', '/api/v2/store', '/api/v2/hall/history', '/api/v2/hall/replays']) {
    assert.ok(combined.includes(route), route);
  }
  assert.ok(combined.includes('X-Aoo-Api-Version'));
});

test('luck draw uses task 57 query/execute authority with stable retry id and lifecycle cleanup', () => {
  const controller = read('Modules/Activity/Code/LuckDrawController.ts');
  const gateway = read('Common/Code/Runtime/Activity/LuckDrawGateway.ts');
  assert.match(gateway, /get\('\/api\/v2\/luck-draw'/);
  assert.match(gateway, /mutate\('POST', `\/api\/v2\/luck-draw\?campaignCode=/);
  assert.match(controller, /pendingRequestId \?\?/);
  assert.match(controller, /if \(this\.drawing/);
  assert.match(controller, /legacy-luck-draw-result/);
  assert.match(controller, /legacy-luck-draw-error/);
  assert.match(controller, /this\.generation \+= 1/);
  assert.match(controller, /component\.interactable = enabled/);
  assert.doesNotMatch(controller + gateway, /CLuckDraw|GetLuckGoods|legacy\/v1\/luck-draw/);
});

test('R63 identity and WeChat production UI chains are instantiated without old transport', () => {
  const screen=read('Lobby/Code/LobbyScreenController.ts');
  const bridge=read('Lobby/Code/LobbyModuleCoordinator.ts');
  const identity=read('Modules/Profile/Code/IdentityController.ts');
  const identityClient=read('Common/Code/Runtime/Identity/IdentityVerificationClient.ts');
  const binding=read('Modules/Profile/Code/WeChatBindingController.ts');
  const login=read('Login/Code/Auth/AooWeChatLoginController.ts');
  const bootstrap=read('Login/Code/Bootstrap/LoginScreenBootstrap.ts');
  assert.match(screen,/identity\.openRealName\(\)/);assert.match(screen,/identity\.openPhone\(\)/);
  assert.match(bridge,/new IdentityController/);assert.match(bridge,/new WeChatBindingController/);
  for(const route of ['/api/v2/identity-verification/status','/real-name/submissions','/phone/challenges'])assert.ok(identityClient.includes(route));
  assert.match(binding,/\/api\/v2\/wechat\/bind/);assert.match(login,/\/api\/v2\/wechat\/login/);
  assert.match(login,/\/api\/v2\/gateway\/ws_ticket/);assert.match(bootstrap,/installWeChatLogin/);
  assert.doesNotMatch(identity+binding+login,/ProtocolClient|ClientPack|CLuck|LegacySocialService|OnWeChatLogin/);
});
