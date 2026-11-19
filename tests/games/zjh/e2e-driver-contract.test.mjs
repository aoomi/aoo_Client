import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createZjhFixturePasswordHash } from '../../../work/zjh-fixture-password.mjs';

const path = new URL('../../../work/zjh-full-e2e.mjs', import.meta.url);

test('ZJH E2E is isolated, local-only and covers the complete room lifecycle', async () => {
  const source = await readFile(path, 'utf8');
  for (const marker of ['assertHeadlessBrowserPlan', "['74', '75']", '127.0.0.1', 'usesUserSession: false', 'CreateRoom', 'JoinRoom', 'RealTimeRecord', 'SmallSettlement', 'BigSettlement_0', 'Btn_ReturnLobby']) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(source, /finally[\s\S]*browser\.stop/);
  assert.doesNotMatch(source, /accessToken|refreshToken|hiddenCard|deck|牌墙|暗牌/);
});

test('ZJH E2E drives visible UI and never calls gameplay controllers directly', async () => {
  const source = await readFile(path, 'utf8');
  assert.match(source, /clickExpression/);
  assert.match(source, /Input|EditBox/);
  assert.doesNotMatch(source, /Zjh(?:Room)?Controller[^\n]*\.(?:sit|start|look|bet|fold|compare|settle)\s*\(/);
});

test('ZJH fixture password uses the Account PBKDF2 encoding without shell interpolation', () => {
  const password = 'offline-fixture-only';
  const encoded = createZjhFixturePasswordHash(password, Buffer.alloc(16, 7));
  const [algorithm, iterations, salt, derived] = encoded.split('$');
  assert.equal(algorithm, 'pbkdf2-sha256');
  assert.equal(iterations, '210000');
  assert.equal(encoded.length, 87);
  assert.equal(Buffer.from(derived, 'base64url').length, 32);
  assert.deepEqual(Buffer.from(derived, 'base64url'),
    pbkdf2Sync(password, Buffer.from(salt, 'base64url'), 210_000, 32, 'sha256'));
  assert.throws(() => createZjhFixturePasswordHash('', Buffer.alloc(16)), /fixture password/);
  assert.throws(() => createZjhFixturePasswordHash(password, Buffer.alloc(15)), /fixture salt/);
});
