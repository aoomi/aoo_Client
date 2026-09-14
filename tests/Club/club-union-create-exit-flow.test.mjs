import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyUnionCreateController.ts', import.meta.url), 'utf8');

assert.match(source, /request<Record<string, unknown>>\('union\.CUnionCreate', packet\)/,
    '联盟创建必须等待服务端成功响应');
assert.match(source, /request<Record<string, unknown>>\('club\.CGetClubListById', \{ clubId: this\.clubId \}\)/,
    '联盟创建后必须回查亲友圈持久化状态');
assert.match(source, /Number\(club\.unionId \?\? union\.unionId \?\? 0\) <= 0/,
    '只有确认获得有效联盟 ID 后才能提示创建成功');
assert.match(source, /await this\.onCreated\?\.\(club, union\)/,
    '创建成功后必须通知亲友圈主界面刷新联盟状态');
assert.doesNotMatch(source, /ui\/club\/ClubMainDefault|ui\/club_1\/UIClubMain_1|ui\/club_2\/UIClubMain_2/,
    '联盟创建成功后不得关闭亲友圈主界面');

console.log('club union create exit flow contract passed');
