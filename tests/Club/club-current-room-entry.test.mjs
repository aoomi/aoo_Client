import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const main = readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyClubMainController.ts', import.meta.url), 'utf8');
const prefab = readFileSync(new URL('../../assets/Club/Prefab/ClubMain.prefab', import.meta.url), 'utf8');

test('当前房间提示层仅供等待进入玩法使用', () => {
    const checkCurrentRoom = main.match(/private async checkCurrentRoom\(\): Promise<void> \{[\s\S]*?\n    \}/)?.[0] ?? '';
    assert.match(checkCurrentRoom, /this\.isWaitingEntry\(room\)/,
        '恢复亲友圈时只有等待进入房间才能显示 RoomDetails');
    assert.match(checkCurrentRoom, /this\.openCurrentRoomDetails\(room\)/);
    assert.doesNotMatch(main, /forms\.register\('ui\/club\/UIClubInRoom'/,
        'RoomDetails 内嵌后不得继续注册独立 ClubInRoom 表单');
    assert.match(main, /node\('RoomDetails'\)/);
    assert.match(prefab, /"_name": "RoomDetails"/);
    assert.match(main, /this\.find\(root, 'btn_exitroom'\)/);
    assert.match(main, /this\.find\(root, 'mask\/userlist'\)/);
    assert.doesNotMatch(main, /this\.find\(root, 'data\//,
        'RoomDetails 已直接承载原预制体子节点，不得保留旧 data 中间层路径');
});

test('已入座的俱乐部房间仍经大厅权威 join 取得完整游戏票据', () => {
    const goCurrentRoom = main.match(/private goCurrentRoom\(\): void \{[\s\S]*?\n    \}/)?.[0] ?? '';
    assert.match(goCurrentRoom, /legacy-club-join-room/);
    assert.doesNotMatch(goCurrentRoom, /open-authoritative-subgame/,
        '俱乐部当前房间信息不是完整 handoff，不得直接启动游戏');
    assert.match(goCurrentRoom, /room\.roomId \?\? room\.roomID/,
        '刷新恢复的旧协议房间号必须统一为 roomId');
    assert.match(goCurrentRoom, /unionId/);
    assert.match(goCurrentRoom, /entryOrigin/);
    assert.match(goCurrentRoom, /returnContext: \{ clubId, unionId \}/);
});
