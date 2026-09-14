import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const template = read('preview-template/index.ejs');
const runtime = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkRuntime.ts');
const play = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts');

test('desktop and LAN expose one deterministic runtime identity', () => {
  assert.match(template, /aoo-preview-20260906-unified-room-4/);
  assert.match(template, /\[AooRuntimeIdentity\]/);
  assert.match(template, /protocolVersion: '2\.0'/);
  assert.doesNotMatch(template, /Date\.now\(\)\.toString\(36\)/);
});

test('foreground restoration consumes a fresh authoritative snapshot once', () => {
  assert.match(runtime, /addEventListener\?\.\('pageshow', resume\)/);
  assert.match(runtime, /addEventListener\?\.\('visibilitychange', resume\)/);
  assert.match(runtime, /if \(this\.resumePending\) return this\.resumePending/);
  assert.match(runtime, /removeEventListener\?\.\('pageshow', resume\)/);
  assert.match(runtime, /removeEventListener\?\.\('visibilitychange', resume\)/);
});

test('automatic hint is driven only by authoritative turn and snapshot state', () => {
  assert.match(play, /autoHintForAuthoritativeTurn\(setInfo/);
  assert.match(play, /this\.activeOpPos === this\.clientSeat\(\)/);
  assert.match(play, /stateVersion/);
  assert.doesNotMatch(play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'), play.indexOf('private maybeAutoPlay')), /navigator|userAgent|visibility|pointer|touch|setTimeout/);
});
