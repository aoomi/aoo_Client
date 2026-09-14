import assert from 'node:assert/strict';
import test from 'node:test';
import { requireSelectableServer, resolveDirectoryServer } from '../assets/Common/Code/Runtime/ServerDirectory/ServerDirectoryPolicy.ts';
import type { ServerDirectory } from '../assets/Common/Code/Runtime/ServerDirectory/ServerDirectoryTypes.ts';

const directory: ServerDirectory = { revision: 7, selectedServerId: 1, servers: [
    { id: 1, code: 'old', name: '旧一区', region: 'cn', endpoint: 'wss://edge.example/api/v1/gateway/ws', state: 'MIGRATING', weight: 10, migrateToServerId: 2, message: '迁服中' },
    { id: 2, code: 'new', name: '新一区', region: 'cn', endpoint: 'wss://edge2.example/api/v1/gateway/ws', state: 'ACTIVE', weight: 100, migrateToServerId: null, message: null },
    { id: 3, code: 'maintenance', name: '维护区', region: 'cn', endpoint: 'wss://edge3.example/api/v1/gateway/ws', state: 'MAINTENANCE', weight: 1, migrateToServerId: null, message: '维护中' },
] };

test('follows authoritative migration target and never returns the retired endpoint', () => {
    assert.equal(resolveDirectoryServer(directory)?.id, 2);
});

test('rejects maintenance server selection', () => {
    assert.throws(() => requireSelectableServer(directory, 3), /维护中/);
});
