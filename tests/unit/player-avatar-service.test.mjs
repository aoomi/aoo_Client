import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const clientRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(join(clientRoot, 'assets/Common/Code/UI/PlayerAvatarService.ts'), 'utf8');

test('local avatar fallback is opt-in and stale loopback URLs do not create failed requests', () => {
  const base = source.slice(source.indexOf('function avatarBaseUrl'), source.indexOf('function avatarFileNumber'));
  assert.match(base, /avatarBaseUrl\?\.trim\(\)/);
  assert.doesNotMatch(base, /location\?\.hostname|http:\/\//);
  assert.match(source, /function unavailableImplicitLocalAvatar/);
  assert.match(source, /url\.port === String\(LOCAL_AVATAR_PORT\)/);
  assert.match(source, /preferred && !unavailableImplicitLocalAvatar\(preferred\)/);
});
