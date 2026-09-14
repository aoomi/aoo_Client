import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const lobby = readFileSync(new URL('assets/Lobby/Code/LobbyScreenController.ts', root), 'utf8');
const join = readFileSync(new URL('assets/Club/Code/Runtime/LegacyJoinUnionController.ts', root), 'utf8');
const message = readFileSync(new URL('assets/Common/Prefab/Message.prefab', root), 'utf8');

assert.match(message, /"_name": "btnSure"/);
assert.match(lobby, /'btnSure', 'btnCancel'/);
assert.match(join, /await this\.tip\('申请加入成功'\)/);
assert.match(join, /this\.forms\.close\(this\.path\);\s*if \(Number\(result\) === 1\) await this\.tip\('申请加入成功'\)/,
    '加入键盘必须先关闭，再显示成功提示，避免确定事件穿透后重复提交');

console.log('join union success confirmation passed');
