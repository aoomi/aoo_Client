import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const relative = 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSocialController.ts';
const source = fs.readFileSync(path.join(clientRoot, relative), 'utf8');
const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: relative })(
    (specifier) => specifier === 'cc' ? { Button: { EventType: { CLICK: 'click' } }, Node: class {} } : {},
    module,
    module.exports,
);
const { CommonPdkSocialController } = module.exports;

function harness({ reject = false, capabilities } = {}) {
    const listeners = new Map();
    const requests = [];
    const shown = [];
    const hidden = [];
    const magic = [];
    const emojis = [];
    const errors = [];
    const runtime = {
        on(event, listener) { listeners.set(event, listener); return () => listeners.delete(event); },
        action(_key, event, body) { requests.push({ event, body }); return reject ? Promise.reject(new Error('send failed')) : Promise.resolve({}); },
        getRoomManager: () => ({ GetEnterRoomID: () => 42 }),
        getRoomPosManager: () => ({ GetClientPos: () => 0, GetRoomAllPlayerInfo: () => ({ 0: { pid: 10 }, 1: { pid: 15 }, 2: { pid: 20 } }) }),
    };
    const media = { recordVoice: async () => null, uploadVoice: async () => ({ mediaId: 'm' }), playVoice: async () => {}, cancel() {} };
    const view = {
        showQuickText: (...args) => shown.push(args), showVoice: (...args) => shown.push(['voice', ...args]),
        showEmoji: (...args) => emojis.push(args),
        hideVoice: (seat) => hidden.push(seat), playMagicExpression: (...args) => magic.push(args), clear() {},
    };
    return { controller: new CommonPdkSocialController(runtime, media, view, (message) => errors.push(message), Date.now, capabilities), listeners, requests, shown, hidden, magic, emojis, errors };
}

test('disabled catalog social capabilities do not subscribe or dispatch', async () => {
    const h = harness({ capabilities: { supportsChat: false, supportsVoice: false } });
    assert.equal(h.listeners.has('room.quick_text'), false);
    assert.equal(h.listeners.has('room.voice'), false);
    assert.equal(h.listeners.has('room.magic_expression'), true);
    await assert.rejects(h.controller.sendQuickText(1), /未启用聊天功能/);
    await assert.rejects(h.controller.sendChatText('你好'), /未启用聊天功能/);
    await assert.rejects(h.controller.sendEmoji(1), /未启用聊天功能/);
    await assert.rejects(h.controller.recordAndSendVoice(), /未启用语音功能/);
    assert.equal(h.requests.length, 0);
});

test('quick text uses authoritative common dispatch and failed send restores retry', async () => {
    const ok = harness();
    await ok.controller.sendQuickText(1);
    assert.deepEqual(ok.requests[0], { event: 'common.room.dispatch', body: { command: 'quick_text', roomId: 42, seatId: 0, quickId: 1 } });
    assert.deepEqual(ok.shown, [[0, '大家好，很高兴见到各位！', 3000]]);
    await assert.rejects(ok.controller.sendQuickText(1), /操作太频繁/);

    const failed = harness({ reject: true });
    await assert.rejects(failed.controller.sendQuickText(2), /send failed/);
    await assert.rejects(failed.controller.sendQuickText(2), /send failed/);
    assert.equal(failed.requests.length, 2);
});

test('typed text and emoji display immediately and use the shared room dispatch', async () => {
    const h = harness();
    await h.controller.sendChatText('  你好  ');
    await h.controller.sendEmoji(6);
    assert.deepEqual(h.shown, [[0, '你好', 3000]]);
    assert.deepEqual(h.emojis, [[0, 6, 3000]]);
    assert.deepEqual(h.requests, [
        { event: 'common.room.dispatch', body: { command: 'quick_text', roomId: 42, seatId: 0, quickId: 0, content: '你好' } },
        { event: 'common.room.dispatch', body: { command: 'quick_text', roomId: 42, seatId: 0, quickId: 106 } },
    ]);
    h.listeners.get('room.quick_text')({ seatId: 2, quickId: 120 });
    assert.deepEqual(h.emojis.at(-1), [2, 20, 3000]);
    h.controller.receiveLegacyChat({ senderPid: 20, quickID: 103 });
    assert.deepEqual(h.emojis.at(-1), [2, 3, 3000]);
});

test('empty room voice payload never shows a bubble; valid duplicate only plays once', async () => {
    const h = harness();
    h.listeners.get('room.voice')({});
    await Promise.resolve();
    assert.equal(h.shown.length, 0);
    const voice = { messageId: 'v1', seatId: 2, mediaId: 'asset-1', durationMs: 900, codec: 'opus' };
    h.listeners.get('room.voice')(voice);
    h.listeners.get('room.voice')(voice);
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(h.shown, [['voice', 2, 900]]);
    assert.deepEqual(h.hidden, [2]);
});

test('magic expression receive is deduplicated and teardown removes listeners', () => {
    const h = harness();
    const message = { serverSeq: 9, sourceSeatId: 1, targetSeatId: 2, expressionId: 3 };
    h.listeners.get('room.magic_expression')(message);
    h.listeners.get('room.magic_expression')(message);
    assert.deepEqual(h.magic, [[1, 2, 3]]);
    h.controller.destroy();
    assert.equal(h.listeners.size, 0);
});

test('magic expression displays immediately and dispatches the selected target and stable id', async () => {
    const h = harness();
    await h.controller.sendMagicExpression(2, 13);
    assert.deepEqual(h.magic, [[0, 2, 13]]);
    assert.deepEqual(h.requests, [{
        event: 'common.room.dispatch',
        body: { command: 'magic_expression', roomId: 42, seatId: 0, targetSeatId: 2, expressionId: 13 },
    }]);
    await assert.rejects(h.controller.sendMagicExpression(2, 16), /魔法表情无效/);
});

test('magic expression self-avatar action broadcasts concurrently to every other occupied seat', async () => {
    const h = harness();
    await h.controller.sendMagicExpressionToAll(6);
    assert.deepEqual(h.magic, [[0, 1, 6], [0, 2, 6]]);
    assert.deepEqual(h.requests, [1, 2].map((targetSeatId) => ({
        event: 'common.room.dispatch',
        body: { command: 'magic_expression', roomId: 42, seatId: 0, targetSeatId, expressionId: 6 },
    })));
});
