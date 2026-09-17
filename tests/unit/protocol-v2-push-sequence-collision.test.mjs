import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../assets/Common/Code/Runtime/network/LegacyWebSocketClient.ts', import.meta.url), 'utf8');

test('a V2 push cannot resolve an unrelated pending response with the same sequence', () => {
  assert.match(source, /packet\.event === 'protocol\.v2\.push' \? undefined : this\.pending\.get\(packet\.sequence\)/);
  assert.ok(source.indexOf("packet.event === 'protocol.v2.push'") < source.indexOf('if (pending)'));
});
