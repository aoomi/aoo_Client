import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function compile(file, dependencies) {
  const output = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: file })(
    (specifier) => {
      if (specifier in dependencies) return dependencies[specifier];
      throw new Error(`unexpected import ${specifier}`);
    }, module, module.exports,
  );
  return module.exports;
}

test('the generated session replacement push is consumed without polling or protocol changes', () => {
  const network = read('assets/Login/Code/Network/NetworkRuntime.ts');
  const protocol = read('assets/Common/Code/Runtime/network/ProtocolClient.ts');
  assert.match(network, /sessionLifecycle\.onReplacement/);
  assert.match(protocol, /canonicalize\(action\) === 'system\.kick_out'/);
  assert.doesNotMatch(network, /setInterval|poll/i);
});

test('WeChat takeover commits one canonical session and leaves websocket ownership to NetworkRuntime', () => {
  const controller = read('assets/Login/Code/Auth/AooWeChatLoginController.ts');
  const router = read('assets/Login/Code/Navigation/SceneRouter.ts');
  assert.match(controller, /loginMode:'SINGLE_DEVICE'/);
  assert.doesNotMatch(controller, /loginMode:'MULTI_DEVICE'/);
  assert.match(controller, /account\.refreshWsTicket=\(\)=>this\.issueTicket\(account\)/);
  assert.doesNotMatch(controller, /account\.wsTicket\s*=/);
  assert.match(router, /const operationId = \+\+this\.navigationGeneration/);
  assert.match(router, /operationId === this\.navigationGeneration/);
  assert.match(router, /DISCARD_LATE_/);
  assert.doesNotMatch(router, /大厅场景已切换，取消迟到登录结果/);
});

test('a standard V2 kick fixture decodes and dispatches through the real ProtocolClient', () => {
  class TransportStub {
    listeners = new Map();
    on(event, listener) {
      const listeners = this.listeners.get(event) ?? new Set();
      listeners.add(listener); this.listeners.set(event, listeners);
      return () => listeners.delete(listener);
    }
    close() { this.listeners.clear(); }
    emit(event, body) { for (const listener of this.listeners.get(event) ?? []) listener(body); }
    decodeWire(frame) { return { event: 'protocol.v2.push', body: JSON.parse(frame) }; }
  }
  let replacement = null;
  const { ProtocolClient } = compile('assets/Common/Code/Runtime/network/ProtocolClient.ts', {
    './LegacyWebSocketClient': {
      LegacyWebSocketClient: TransportStub,
      sessionLifecycle: { confirmReplacement: (source, reasonCode) => { replacement = { source, reasonCode }; } },
    },
    '../CompatibilityApp/core/CausalEventGuard': { CausalEventGuard: class { dispatch(_c, _id, callback) { return callback(); } } },
    './ClientErrorCorrelation': { ClientErrorCorrelation: { enrich: (error) => error } },
    './GatewayEntryPolicy': { requireCanonicalWebSocketUrl: (url) => url },
    '../config/RuntimeEndpoints': { resolvePageInstanceId: () => 'test-page' },
  });
  const client = new ProtocolClient();
  let received = null;
  client.on('system.kick_out', (body) => { received = body; });
  const fixture = JSON.stringify({
    protocolVersion: '2.0', msgId: 'system.kick_out', kind: 'push',
    requestId: 'replacement-fixture', seq: 1, timestamp: 1, traceId: 'replacement-fixture',
    body: { action: 'system.kick_out', payload: { reasonCode: 'SESSION_REPLACED', message: '你的账号已在其他设备登录' } },
  });
  const packet = client.decodeWire(fixture);
  client.emit(packet.event, packet.body);
  assert.deepEqual(received, { reasonCode: 'SESSION_REPLACED', message: '你的账号已在其他设备登录' });
  assert.deepEqual(replacement, { source: 'protocol-push', reasonCode: 'SESSION_REPLACED' });
});

test('one replacement atomically freezes every hall and room websocket in this page', async () => {
  const sockets = [];
  const OriginalWebSocket = globalThis.WebSocket;
  class FakeWebSocket {
    static OPEN = 1;
    readyState = 0;
    constructor(url) { this.url = url; sockets.push(this); queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
    send() {}
    close() { this.readyState = 3; this.closed = true; }
  }
  globalThis.WebSocket = FakeWebSocket;
  try {
    const legacy = compile('assets/Common/Code/Runtime/network/LegacyWebSocketClient.ts', {
      './LegacyPacketCodec': { LegacyPacketCodec: class {} },
      './GatewayEntryPolicy': { requireCanonicalWebSocketUrl: (url) => url },
    });
    const hall = new legacy.LegacyWebSocketClient('hall');
    const room = new legacy.LegacyWebSocketClient('room');
    const settlement = new legacy.LegacyWebSocketClient('settlement');
    await Promise.all([hall.connect('wss://example/hall'), room.connect('wss://example/room'), settlement.connect('wss://example/result')]);
    room.confirmSessionReplacement('fixture');
    assert.equal(sockets.filter((socket) => socket.closed).length, 3);
    await assert.rejects(() => hall.connect('wss://example/hall'), /会话已冻结/);
    legacy.sessionLifecycle.resumeAfterExplicitLogin();
    await hall.connect('wss://example/hall');
    assert.equal(sockets.at(-1).readyState, 1);
    hall.close();
  } finally { globalThis.WebSocket = OriginalWebSocket; }
});

test('room close 4001 wins before push and frozen clients never enter reconnect attempts', async () => {
  const sockets = [];
  const OriginalWebSocket = globalThis.WebSocket;
  class FakeWebSocket {
    static OPEN = 1;
    readyState = 0;
    constructor(url) { this.url = url; sockets.push(this); queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
    send() {}
    close() { this.readyState = 3; this.closed = true; }
    remoteClose(code, reason) { this.readyState = 3; this.onclose?.({ code, reason }); }
  }
  globalThis.WebSocket = FakeWebSocket;
  try {
    const legacy = compile('assets/Common/Code/Runtime/network/LegacyWebSocketClient.ts', {
      './LegacyPacketCodec': { LegacyPacketCodec: class {} },
      './GatewayEntryPolicy': { requireCanonicalWebSocketUrl: (url) => url },
    });
    const hall = new legacy.LegacyWebSocketClient('hall');
    const room = new legacy.LegacyWebSocketClient('room');
    await Promise.all([hall.connect('wss://example/hall'), room.connect('wss://example/room')]);
    assert.equal(room.setReconnectAuthenticator, undefined,
      'transport must not expose an internal reconnect owner');
    let replacements = 0;
    legacy.sessionLifecycle.onReplacement(() => { replacements += 1; });
    sockets[1].remoteClose(4001, 'SESSION_REPLACED');
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(replacements, 1);
    assert.equal(sockets.length, 2, 'freeze must prevent the first and all later reconnect attempts');
    room.confirmSessionReplacement('late-push');
    assert.equal(replacements, 1, 'late push must share the same one-shot latch');
  } finally { globalThis.WebSocket = OriginalWebSocket; }
});

test('replacement notice is topmost, exact, one-shot, and clears only local credentials after confirmation', () => {
  const auth = read('assets/Login/Code/Auth/AuthSession.ts');
  const router = read('assets/Login/Code/Navigation/SceneRouter.ts');
  const bootstrap = read('assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts');

  assert.match(router, /sessionReplacementNoticeAvailable = false/);
  assert.match(router, /this\.auth\.suspendReplacedSession\(\)/);
  assert.match(router, /this\.auth\.clearReplacedSession\(\)/);
  assert.match(bootstrap, /getChildByName\('Login'\)[\s\S]*getChildByName\('Message'\)/);
  assert.match(bootstrap, /richText\.string = '你的账号已在其他设备登录'/);
  assert.match(bootstrap, /message\.setSiblingIndex\(login!\.children\.length - 1\)/);
  assert.match(bootstrap, /message\.getChildByName\('btnSure'\)/);
  assert.match(auth, /clearReplacedSession\(\)[\s\S]*this\.sessionStore\.clear\(\)/);
  const localClear = auth.slice(auth.indexOf('public clearReplacedSession'), auth.indexOf('/**', auth.indexOf('public clearReplacedSession')));
  assert.doesNotMatch(localClear, /gateway\.logout/);
});

test('LoginScene owns the replacement Message node and never uses a drift placeholder', () => {
  const scene = JSON.parse(read('assets/Login/Scenes/LoginScene.scene'));
  const loginIndex = scene.findIndex((entry) => entry?.__type__ === 'cc.Node' && entry?._name === 'Login');
  const messageIndex = scene.findIndex((entry) => entry?.__type__ === 'cc.Node' && entry?._name === 'Message');
  assert.ok(loginIndex >= 0 && messageIndex >= 0);
  assert.equal(scene[messageIndex]._parent.__id__, loginIndex);
  const childNames = scene[messageIndex]._children.map((child) => scene[child.__id__]?._name);
  assert.deepEqual(childNames, ['LabelMessage', 'btnCancel', 'btnSure', 'btn_close']);
  assert.equal(scene[messageIndex]._active, false);
  assert.doesNotMatch(JSON.stringify(scene[messageIndex]), /悬浮窗口信息/);
});

test('refresh 401 separates replacement from ordinary invalid sessions and stops the lobby', () => {
  const lobby = read('assets/Lobby/Code/LobbyScreenController.ts');
  const router = read('assets/Login/Code/Navigation/SceneRouter.ts');
  const classifier = compile('assets/Login/Code/Network/SessionInvalidation.ts', {});
  assert.equal(classifier.classifyRefreshFailure(401, {
    code: 'UNAUTHORIZED', data: { reasonCode: 'SESSION_REPLACED' }, message: 'invalid session',
  }), 'SESSION_REPLACED');
  assert.equal(classifier.classifyRefreshFailure(401, {
    code: 'INVALID_SESSION', message: 'invalid session',
  }), 'SESSION_INVALID');
  assert.equal(classifier.classifyRefreshFailure(403, { reasonCode: 'SESSION_REPLACED' }), null);
  assert.match(lobby, /classifyRefreshFailure\(response\.status, packet\)/);
  assert.match(lobby, /this\.sessionInvalidated = true;[\s\S]*confirmSessionReplacement\('refresh-401'\)/);
  assert.match(router, /reason === 'SESSION_REPLACED'[\s\S]*this\.handleSessionReplacement\(\)/);
  assert.match(router, /this\.network\.suspendSession\(\)[\s\S]*this\.auth\.clearReplacedSession\(\)[\s\S]*this\.showLogin\(\)/);
});
