import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(
    new URL('../../assets/Modules/Support/Code/SupportNumberCopyController.ts', import.meta.url),
    'utf8',
);
const enabled = fs.readFileSync(
    new URL('../../assets/Modules/Support/Code/SupportController.ts', import.meta.url),
    'utf8',
);
const bridge = fs.readFileSync(
    new URL('../../assets/Lobby/Code/LobbyModuleCoordinator.ts', import.meta.url),
    'utf8',
);
const registry = fs.readFileSync(
    new URL('../../assets/Common/Code/Runtime/ui/CommonPrefabRegistry.ts', import.meta.url),
    'utf8',
);
const lobbyScreen = fs.readFileSync(
    new URL('../../assets/Lobby/Code/LobbyScreenController.ts', import.meta.url),
    'utf8',
);
const driftLifecycle = fs.readFileSync(
    new URL('../../assets/Common/Code/Runtime/ui/MsgDriftLifecycle.ts', import.meta.url),
    'utf8',
);
const loginBootstrap = fs.readFileSync(
    new URL('../../assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts', import.meta.url),
    'utf8',
);
const formManager = fs.readFileSync(
    new URL('../../assets/Common/Code/Runtime/ui/LegacyFormManager.ts', import.meta.url),
    'utf8',
);
const prefab = JSON.parse(fs.readFileSync(
    new URL('../../assets/Modules/Support/Prefab/Service.prefab', import.meta.url),
    'utf8',
));

test('the full QQ and WeChat fields are authored buttons', () => {
    const nodes = prefab.filter((entry) => entry?.__type__ === 'cc.Node');
    for (const name of ['QQ', 'WeChat']) {
        const node = nodes.find((entry) => entry._name === name);
        assert.ok(node, name);
        assert.ok(node._components.some((ref) => prefab[ref.__id__]?.__type__ === 'cc.Button'), `${name} button`);
    }
});

test('both support modes bind field clicks to clipboard and drift feedback', () => {
    assert.match(source, /\['Copy\/QQ', 'Copy\/WeChat'\]/);
    assert.match(source, /field\.on\(Button\.EventType\.CLICK/);
    assert.match(source, /legacyPlatformBridge\.writeClipboard\(value\)/);
    assert.match(source, /copied \? '复制成功'/);
    assert.match(enabled, /bindSupportNumberCopy\(form,this\.forms\)/);
    assert.match(bridge, /bindSupportNumberCopy\(form, this\.forms\)/);
    assert.match(registry, /UIMessage_Drift:\s*\{ bundle: COMMON_ASSET_BUNDLE, asset: 'Prefab\/MsgDrift' \}/);
    assert.match(lobbyScreen, /createMsgDriftLifecycle/);
    assert.match(loginBootstrap, /createMsgDriftLifecycle/);
    assert.match(driftLifecycle, /authoredPosition \?\?= template\.position\.clone\(\)/);
    assert.match(driftLifecycle, /Tween\.stopAllByTarget\(visual\)/);
    assert.match(driftLifecycle, /Tween\.stopAllByTarget\(opacity\)/);
    assert.match(driftLifecycle, /const visual = instantiate\(template\)/);
    assert.match(driftLifecycle, /activeVisuals\.add\(visual\)/);
    assert.match(driftLifecycle, /play\(form, String\(content \?\? ''\)\)/);
    assert.match(driftLifecycle, /activeVisuals\.delete\(visual\)/);
    assert.doesNotMatch(driftLifecycle, /messages|playNext|if \(running\) return/);
    assert.match(driftLifecycle, /const TOP_HOLD_SECONDS = 0\.5/);
    assert.match(driftLifecycle, /\.delay\(SLIDE_SECONDS \+ TOP_HOLD_SECONDS\)/);
    assert.doesNotMatch(driftLifecycle, /\.delay\(HOLD_SECONDS\)/);
    assert.match(formManager, /if \(path === 'UIMessage_Drift'\)[\s\S]*await pending\.promise[\s\S]*this\.activate\(path, form, args\)/);
    assert.match(formManager, /if \(!current\?\.isValid\) return null/);
    assert.doesNotMatch(lobbyScreen, /message\.fontSize|message\.lineHeight|message\.maxWidth/);
    assert.match(formManager, /path === 'UIMessage_Drift' \? 15_000 : NAVIGATION_REVEAL_DELAY_MS/);
});
