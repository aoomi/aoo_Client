import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('competition client is wired to the canonical gateway and durable recovery stream', () => {
    const root=fileURLToPath(new URL('../',import.meta.url));
    const gateway=readFileSync(`${root}assets/Common/Code/Runtime/Competition/CompetitionGateway.ts`,'utf8');
    const bridge=readFileSync(`${root}assets/Lobby/Code/LobbyModuleCoordinator.ts`,'utf8');
    const screen=readFileSync(`${root}assets/Lobby/Code/LobbyScreenController.ts`,'utf8');
    for(const path of ['/api/v2/matchmaking','/api/v2/tournaments','/api/v2/competition/events'])assert.match(gateway,new RegExp(path));
    for(const action of ["action:'queue'","action:'cancel'","action:'confirm'","action:'register'","action:'withdraw'"])assert.ok(gateway.includes(action));
    assert.ok(bridge.includes('new CompetitionController'));
    assert.ok(screen.includes("'aoo-competition-room-ready'"));
});
