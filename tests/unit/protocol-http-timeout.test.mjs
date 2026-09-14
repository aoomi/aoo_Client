import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../assets/Common/Code/Runtime/network/ProtocolHttpClient.ts', import.meta.url), 'utf8');

test('the sole raw HTTP transport bounds every request including caller-controlled signals', () => {
  assert.match(source, /RAW_FETCH_TIMEOUT_MS\s*=\s*15_000/);
  assert.match(source, /abortApi\.timeout\(ProtocolHttpClient\.RAW_FETCH_TIMEOUT_MS\)/);
  assert.match(source, /abortApi\.any\(\[init\.signal, timeoutSignal\]\)/);
  assert.match(source, /fallbackTimeoutSignal/);
  assert.match(source, /combineSignals/);
  assert.match(source, /globalThis\.fetch\(url, \{ \.\.\.init, signal \}\)/);
});
