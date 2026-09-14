import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('one-time WebSocket credentials travel in handshake protocols, never in the URL', () => {
    const protocol = read('assets/Common/Code/Runtime/network/ProtocolClient.ts');
    const transport = read('assets/Common/Code/Runtime/network/LegacyWebSocketClient.ts');
    assert.doesNotMatch(protocol, /searchParams\.set\(['"]ticket['"]/);
    assert.doesNotMatch(protocol, /searchParams\.set\(['"]pageInstanceId['"]/);
    assert.match(protocol, /return \['aoo\.v2', `aoo\.ticket\.\$\{this\.wsTicket\}`, `aoo\.page\.\$\{resolvePageInstanceId\(\)\}`\]/);
    assert.match(transport, /new WebSocket\(url, this\.resolveSocketProtocols\(\)\)/);
});

test('legacy regionless PDK write requests fail before transport dispatch', () => {
    const protocol = read('assets/Common/Code/Runtime/network/ProtocolClient.ts');
    assert.match(protocol, /route\.canonicalMsgId === 'poker\.pdk\.dispatch'/);
    assert.match(protocol, /旧 pdk 写协议已停用/);
});
