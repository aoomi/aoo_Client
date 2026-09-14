import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');

test('top club credit is visible only for alliance room tickets', () => {
    const coordinator = fs.readFileSync(path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts'), 'utf8');
    const controller = fs.readFileSync(path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
    const paths = fs.readFileSync(path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/Room/PdkRoomNodePaths.ts'), 'utf8');

    assert.match(paths, /clubCent:\s*'RoomInfo\/Lb_ClubCent'/);
    assert.match(coordinator, /ticket\.entryOrigin === 'UNION' \|\| Number\(ticket\.unionId \?\? ticket\.returnContext\?\.unionId \?\? 0\) > 0/);
    assert.match(controller, /visible\(CommonRoomNodePath\.clubCent, this\.isUnionRoom\)/);
    assert.match(controller, /if \(this\.isUnionRoom\) \{/);
    assert.doesNotMatch(controller, /visible\(CommonRoomNodePath\.clubCent,\s*true\)/);
});

test('common room prefab keeps the credit node under RoomInfo', () => {
    const objects = JSON.parse(fs.readFileSync(path.join(root, 'assets/Games/Common/Prefab/CommonRoom.prefab'), 'utf8'));
    const credit = objects.find(value => value?.__type__ === 'cc.Node' && value._name === 'Lb_ClubCent');
    assert.ok(credit);
    const parent = objects[credit._parent?.__id__];
    assert.equal(parent?._name, 'RoomInfo');
});
