import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const protocolClient = readFileSync(new URL('assets/Common/Code/Runtime/network/ProtocolClient.ts', root), 'utf8');
const entryPolicy = readFileSync(new URL('assets/Common/Code/Runtime/network/GatewayEntryPolicy.ts', root), 'utf8');
const httpClient = readFileSync(new URL('assets/Common/Code/Runtime/network/ProtocolHttpClient.ts', root), 'utf8');

assert.match(entryPolicy, /GATEWAY_WS_PATH\s*=\s*`\$\{API_PREFIX\}\/gateway\/ws`/);
assert.match(entryPolicy, /keys\.some\(key => key !== 'ticket'\)/);
assert.match(protocolClient, /response\.kind !== 'resp'/);
assert.match(protocolClient, /response\.msgId !== envelope\.msgId/);
assert.match(protocolClient, /response\.seq !== envelope\.seq/);
assert.match(protocolClient, /response\.traceId !== envelope\.traceId/);
assert.match(protocolClient, /权威请求缺少 roomId/);
assert.match(protocolClient, /权威请求缺少 playVersion/);
assert.doesNotMatch(protocolClient, /playVersion \?\? '1\.0\.0'/);
assert.doesNotMatch(protocolClient, /wsTicket:\s*this\.wsTicket/);
assert.match(protocolClient, /protected override encodeWire/);
assert.match(protocolClient, /JSON\.stringify\(body\)/);
assert.match(protocolClient, /kind === 'push' \? 'protocol\.v2\.push' : 'protocol\.v2\.dispatch'/);
assert.match(httpClient, /const code = typeof result\.code === 'number'/);

console.log('R05 client protocol contract passed');
