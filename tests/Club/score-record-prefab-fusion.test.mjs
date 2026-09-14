import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prefabDir = path.join(clientRoot, 'assets/Club/Prefab');
const expectedTemplates = [
    'CompAdjust',
    'Penalty',
    'AuthAdd',
    'AuthReduce',
    'RoomAuthReduce',
    'Reward',
    'ShuffleFee',
    'SafeTransfer',
    'RateChange',
    'MemberRemove',
    'WarnScore',
    'AuditAdd',
    'SelfRate',
    'EntryFee',
    'SurvivalScore',
    'MemberKick',
    'OwnerChange',
];

test('ScoreRecord contains all semantically named message templates and keeps the sources', () => {
    for (let type = 0; type <= 16; type += 1) {
        assert.ok(
            fs.existsSync(path.join(prefabDir, `MsgNodeMsgType${type}.prefab`)),
            `source MsgNodeMsgType${type}.prefab must remain`,
        );
    }

    const objects = JSON.parse(fs.readFileSync(path.join(prefabDir, 'ClubScoreRecord.prefab'), 'utf8'));
    const rootId = objects[0]?.data?.__id__;
    assert.ok(Number.isInteger(rootId), 'ScoreRecord root id missing');
    const root = objects[rootId];
    assert.deepEqual(root._children.map(({ __id__ }) => objects[__id__]._name), expectedTemplates);

    const legacyName = /^(?:Node(?:-\d+)?|lb_|img_|btn_|detailNode$|demoDetail$|MsgNodeMsgType)/;
    for (const object of objects) {
        if (object?.__type__ !== 'cc.Node') continue;
        assert.ok(object._name, 'ScoreRecord must not contain unnamed nodes');
        assert.ok(object._name.length <= 16, `hierarchy name is not concise: ${object._name}`);
        assert.doesNotMatch(object._name, /[^_]\d+$/, `numeric suffix must use an underscore: ${object._name}`);
        assert.doesNotMatch(object._name, legacyName, `legacy hierarchy name remains: ${object._name}`);
        for (const child of object._children ?? []) {
            assert.ok(Number.isInteger(child.__id__) && objects[child.__id__], `invalid child reference ${child.__id__}`);
        }
    }

});

test('ScoreRecord keeps its existing Creator UUID', () => {
    const meta = JSON.parse(fs.readFileSync(path.join(prefabDir, 'ClubScoreRecord.prefab.meta'), 'utf8'));
    assert.equal(meta.uuid, '785e0063-0fee-44e0-8eb9-ef75c638f945');
});

test('ScoreRecord sprites all use ClubScoreRecord atlas frames', () => {
    const objects = JSON.parse(fs.readFileSync(path.join(prefabDir, 'ClubScoreRecord.prefab'), 'utf8'));
    const atlasUuid = '3c2c769c-2345-4723-9be1-afb5388d4177@';
    const sprites = objects.filter((object) => object?.__type__ === 'cc.Sprite');
    assert.equal(sprites.length, 82);
    for (const sprite of sprites) {
        assert.ok(sprite._spriteFrame?.__uuid__?.startsWith(atlasUuid),
            `sprite is outside ClubScoreRecord atlas: ${sprite._spriteFrame?.__uuid__ ?? 'missing'}`);
    }
});
