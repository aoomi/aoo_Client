import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = join(process.cwd(), 'assets', 'Common', 'Code', 'Runtime', 'navigation');
const source = readFileSync(join(root, 'PublishedRoomResourceRoute.ts'), 'utf8');
const gateway = readFileSync(join(process.cwd(), 'assets', 'Lobby', 'Code', 'Runtime', 'HallRoomGateway.ts'), 'utf8');

test('historical room bundles have one centralized, auditable resolver', () => {
    assert.match(source, /'poker01-prefab': 'paodekuai-common'/);
    assert.match(source, /'pdk-common-room': 'paodekuai-common'/);
    assert.match(gateway, /resolvePublishedRoomBundle\(room\.bundleName\)/);
});
