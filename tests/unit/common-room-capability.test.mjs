import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

class FakeButton {
    static EventType = Object.freeze({ CLICK: 'click' });
    interactable = true;
}

class FakeNode {
    static EventType = Object.freeze({
        TOUCH_START: 'touch-start',
        TOUCH_END: 'touch-end',
        TOUCH_CANCEL: 'touch-cancel',
        MOUSE_DOWN: 'mouse-down',
        MOUSE_UP: 'mouse-up',
    });

    isValid = true;
    active = true;
    #listeners = new Map();
    #button = new FakeButton();

    on(event, handler, target, capture = false) {
        const listeners = this.#listeners.get(event) ?? [];
        listeners.push({ handler, target, capture });
        this.#listeners.set(event, listeners);
    }

    off(event, handler, target, capture = false) {
        const listeners = this.#listeners.get(event) ?? [];
        this.#listeners.set(event, listeners.filter(listener =>
            listener.handler !== handler || listener.target !== target || listener.capture !== capture));
    }

    emit(event) {
        for (const listener of [...(this.#listeners.get(event) ?? [])]) listener.handler();
    }

    listenerCount() {
        return [...this.#listeners.values()].reduce((count, listeners) => count + listeners.length, 0);
    }

    getComponent(type) {
        return type === FakeButton ? this.#button : null;
    }

    get button() {
        return this.#button;
    }
}

function loadController() {
    const source = readFileSync(new URL('../../assets/Games/Common/Code/Room/CommonRoomCapabilityController.ts', import.meta.url), 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    vm.runInThisContext(`(function(require,module,exports){${output}\n})`, {
        filename: 'CommonRoomCapabilityController.ts',
    })((request) => {
        if (request === 'cc') return { Button: FakeButton, Node: FakeNode };
        throw new Error(`unexpected dependency: ${request}`);
    }, module, module.exports);
    return module.exports.CommonRoomCapabilityController;
}

const CommonRoomCapabilityController = loadController();

function createHarness(capabilities, overrides = {}) {
    const nodes = {
        moreButton: new FakeNode(),
        moreItems: new FakeNode(),
        chatButton: new FakeNode(),
        voiceButton: new FakeNode(),
        settlementHistoryButton: new FakeNode(),
    };
    const calls = {
        chatOpen: 0, chatClose: 0, chatDestroy: 0,
        voiceStart: 0, voiceFinish: 0, voiceCancel: 0, voiceDestroy: 0,
        historyToggle: 0, historyClose: 0, historyDestroy: 0,
        reports: [],
    };
    const chat = {
        open: () => { calls.chatOpen += 1; return overrides.chatOpen?.(); },
        close: () => { calls.chatClose += 1; },
        destroy: () => { calls.chatDestroy += 1; },
    };
    const voice = {
        start: () => { calls.voiceStart += 1; return overrides.voiceStart?.(); },
        finish: () => { calls.voiceFinish += 1; },
        cancel: () => { calls.voiceCancel += 1; },
        destroy: () => { calls.voiceDestroy += 1; },
    };
    const history = {
        toggle: () => { calls.historyToggle += 1; return overrides.historyToggle?.(); },
        close: () => { calls.historyClose += 1; },
        destroy: () => { calls.historyDestroy += 1; },
    };
    return {
        nodes,
        calls,
        controller: new CommonRoomCapabilityController(nodes, capabilities, chat, voice, history,
            error => calls.reports.push(error)),
    };
}

const allCapabilities = Object.freeze({ more: true, chat: true, voice: true, settlementHistory: true });

async function settle() {
    await Promise.resolve();
    await Promise.resolve();
}

test('capability gates disable unavailable CommonRoom actions and do not bind them', () => {
    const harness = createHarness({ more: false, chat: false, voice: false, settlementHistory: false });
    harness.controller.install();

    for (const node of [harness.nodes.moreButton, harness.nodes.chatButton,
        harness.nodes.voiceButton, harness.nodes.settlementHistoryButton]) {
        assert.equal(node.active, false);
        assert.equal(node.button.interactable, false);
    }
    assert.equal(harness.nodes.moreItems.active, false);
    for (const node of [harness.nodes.moreButton, harness.nodes.chatButton,
        harness.nodes.voiceButton, harness.nodes.settlementHistoryButton]) {
        assert.equal(node.listenerCount(), 0);
        node.emit(FakeButton.EventType.CLICK);
    }
    assert.deepEqual(harness.calls, {
        chatOpen: 0, chatClose: 0, chatDestroy: 0,
        voiceStart: 0, voiceFinish: 0, voiceCancel: 0, voiceDestroy: 0,
        historyToggle: 0, historyClose: 0, historyDestroy: 0,
        reports: [],
    });
    harness.controller.destroy();
});

test('CommonRoom actions dispatch once per physical input and voice transitions are idempotent', async () => {
    const harness = createHarness(allCapabilities);
    harness.controller.install();
    harness.controller.install();

    assert.equal(harness.nodes.moreButton.listenerCount(), 3);
    assert.equal(harness.nodes.chatButton.listenerCount(), 3);
    assert.equal(harness.nodes.settlementHistoryButton.listenerCount(), 3);
    assert.equal(harness.nodes.voiceButton.listenerCount(), 5);

    harness.nodes.moreButton.emit(FakeButton.EventType.CLICK);
    harness.nodes.moreButton.emit(FakeNode.EventType.TOUCH_END);
    harness.nodes.moreButton.emit(FakeNode.EventType.MOUSE_UP);
    assert.equal(harness.nodes.moreItems.active, true);

    harness.nodes.chatButton.emit(FakeButton.EventType.CLICK);
    harness.nodes.chatButton.emit(FakeNode.EventType.TOUCH_END);
    harness.nodes.chatButton.emit(FakeNode.EventType.MOUSE_UP);
    harness.nodes.settlementHistoryButton.emit(FakeButton.EventType.CLICK);
    harness.nodes.settlementHistoryButton.emit(FakeNode.EventType.TOUCH_END);
    await settle();
    assert.equal(harness.calls.chatOpen, 1);
    assert.equal(harness.calls.historyToggle, 1);

    harness.nodes.voiceButton.emit(FakeNode.EventType.TOUCH_START);
    harness.nodes.voiceButton.emit(FakeNode.EventType.MOUSE_DOWN);
    harness.nodes.voiceButton.emit(FakeNode.EventType.TOUCH_END);
    harness.nodes.voiceButton.emit(FakeNode.EventType.MOUSE_UP);
    harness.nodes.voiceButton.emit(FakeNode.EventType.TOUCH_START);
    harness.nodes.voiceButton.emit(FakeNode.EventType.TOUCH_CANCEL);
    await settle();
    assert.equal(harness.calls.voiceStart, 2);
    assert.equal(harness.calls.voiceFinish, 1);
    assert.equal(harness.calls.voiceCancel, 1);
    assert.deepEqual(harness.calls.reports, []);
    harness.controller.destroy();
});

test('close and destroy release CommonRoom resources exactly once and prevent remount', () => {
    const harness = createHarness(allCapabilities);
    harness.controller.install();
    harness.nodes.moreButton.emit(FakeButton.EventType.CLICK);
    harness.nodes.voiceButton.emit(FakeNode.EventType.TOUCH_START);

    harness.controller.closeWindows();
    assert.equal(harness.nodes.moreItems.active, false);
    assert.equal(harness.calls.chatClose, 1);
    assert.equal(harness.calls.historyClose, 1);
    assert.equal(harness.calls.voiceCancel, 1);

    harness.controller.destroy();
    harness.controller.destroy();
    assert.equal(harness.calls.chatDestroy, 1);
    assert.equal(harness.calls.voiceDestroy, 1);
    assert.equal(harness.calls.historyDestroy, 1);
    assert.equal(harness.nodes.moreButton.listenerCount(), 0);
    assert.equal(harness.nodes.chatButton.listenerCount(), 0);
    assert.equal(harness.nodes.voiceButton.listenerCount(), 0);
    assert.equal(harness.nodes.settlementHistoryButton.listenerCount(), 0);
    assert.throws(() => harness.controller.install(), /COMMON_ROOM_CAPABILITY_DESTROYED/);
});

test('async port failures are surfaced through the CommonRoom report port', async () => {
    const failure = new Error('chat unavailable');
    const harness = createHarness(allCapabilities, { chatOpen: () => Promise.reject(failure) });
    harness.controller.install();
    harness.nodes.chatButton.emit(FakeButton.EventType.CLICK);
    await settle();
    assert.deepEqual(harness.calls.reports, [failure]);
    harness.controller.destroy();
});
