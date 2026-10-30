import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));

function source(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

const reconnect = source('assets/Common/Code/Runtime/network/ReconnectCoordinator.ts');
assert.match(reconnect, /public readonly lobby = this\.hall;/);
assert.match(reconnect, /public cancelLobby\([\s\S]*?this\.cancelHall\(state\)/);

const ownership = source('assets/Common/Code/Runtime/network/ConnectionOwnership.ts');
assert.match(ownership, /public readonly lobby = this\.hall;/);
assert.match(ownership, /public cancelLobby\(\): void/);

const heartbeat = source('assets/Common/Code/Runtime/network/HallHeartbeatService.ts');
assert.match(heartbeat, /export class LobbyHeartbeatService/);
assert.match(heartbeat, /export \{ LobbyHeartbeatService as HallHeartbeatService \};/);

const network = source('assets/Login/Code/Network/NetworkRuntime.ts');
assert.match(network, /public async loginToLobby\(/);
assert.match(network, /public loginToHall\(account[\s\S]*?return this\.loginToLobby\(account\)/);
assert.match(network, /hallWebSocketUrl/);
assert.match(network, /new ProtocolClient\('hall'\)/);

const lifecycle = source('assets/Common/Code/Runtime/room/RoomLifecycleGateway.ts');
assert.match(lifecycle, /export type LobbyRoomLifecycleGateway = RoomLifecycleGateway;/);

console.log('lobby-naming-contract: PASS');
