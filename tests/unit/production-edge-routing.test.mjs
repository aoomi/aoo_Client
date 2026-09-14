import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../assets/', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('runtime discovery derives HTTP and WSS from one production base', () => {
  const source = read('Common/Code/Runtime/config/RuntimeEndpoints.ts');
  assert.match(source, /apiBaseUrl/);
  assert.match(source, /httpGatewayUrl\('\/api\/v2\/account', base\)/);
  assert.match(source, /webSocketGatewayUrl\(undefined, base\)/);
  assert.match(source, /旧独立服务入口已关闭/);
  assert.doesNotMatch(source, /ClientPack|api\/v1\/account/);
  assert.doesNotMatch(source, /account\.production|hall\.production/);
  assert.match(source, /export function resolveRuntimeDeviceId\(\)/);
  assert.match(source, /config\.environment === 'test'/);
  assert.match(source, /testPreviewGatewayOrigin\(undefined\)/);
  assert.match(source, /localStorage\?\.getItem\(key\)/);
  assert.doesNotMatch(source, /local-development-device/);
});

test('production API preserves auth, idempotency and trace across bounded retries', () => {
  const source = read('Common/Code/Runtime/Activity/ProductionApiClient.ts');
  for (const token of ['Authorization: `Bearer ${accessToken}`', 'currentAccessToken()', "'X-Trace-Id': traceId", "'Idempotency-Key'", 'requestMaxRetries', 'response.status === 429', 'resolveRuntimeEndpoints().apiBaseUrl', "'X-Device-Id': endpoints.deviceId", "'X-Client-Channel': endpoints.clientChannel", "'X-Client-Version': endpoints.clientVersion"]) {
    assert.ok(source.includes(token), token);
  }
  assert.doesNotMatch(source, /legacy-cocos-client|legacy-lobby/);
  assert.doesNotMatch(source, /serviceHttpUrl|luckDrawHttpUrl/);
});
