import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(
    new URL('../../assets/Lobby/Code/LobbyScreenController.ts', import.meta.url),
    'utf8',
);
const prefab = JSON.parse(fs.readFileSync(
    new URL('../../assets/Lobby/Prefab/LobbyMain.prefab', import.meta.url),
    'utf8',
));
const bootstrapSource = fs.readFileSync(
    new URL('../../assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts', import.meta.url),
    'utf8',
);

test('lobby entry visibility is independent from prefab parent hierarchy', () => {
    const visibilityStart = source.indexOf('private applyLegacyRuntimeVisibility');
    const visibilityEnd = source.indexOf('private findDescendant', visibilityStart);
    const visibilitySource = source.slice(visibilityStart, visibilityEnd);

    assert.match(visibilitySource, /for \(const name of visibleNodeNames\) this\.lobbySemanticNode\(root, name\)\.active = true/);
    assert.doesNotMatch(visibilitySource, /\['Bottom',\s*'Navigation'/);
    assert.doesNotMatch(visibilitySource, /\['Bottom',\s*'MoreMenu'/);
    assert.doesNotMatch(visibilitySource, /\['Right',\s*'(?:CreateRoom|JoinRoom|JoinClub)'/);
});

test('semantic lobby entries reject missing or ambiguous names', () => {
    assert.match(source, /const matches = this\.findAll\(root, node => node\.name === name\)/);
    assert.match(source, /if \(matches\.length === 0\) throw new Error\(`大厅缺少语义节点: \$\{name\}`\)/);
    assert.match(source, /if \(matches\.length > 1\) throw new Error\(`大厅语义节点名称不唯一: \$\{name\}`\)/);
});

test('interactive avatar loading also uses semantic lookup', () => {
    assert.match(source, /this\.lobbySemanticNode\(root, 'Avatar'\)\.getComponent\(Sprite\)/);
    assert.doesNotMatch(source, /this\.lobbyNode\(root, 'Top', 'Player', 'AvatarMask', 'Avatar'\)/);
});

test('every serialized lobby button keeps a unique semantic name after reparenting', () => {
    const nodes = prefab
        .map((entry, id) => ({ entry, id }))
        .filter(({ entry }) => entry?.__type__ === 'cc.Node');
    const buttons = nodes.filter(({ entry }) => (entry._components ?? [])
        .some(component => prefab[component.__id__]?.__type__ === 'cc.Button'));
    const names = buttons.map(({ entry }) => entry._name);

    assert.ok(names.length > 0, 'LobbyMain must contain serialized buttons');
    assert.equal(new Set(names).size, names.length, 'button semantic names must remain unique');

    // Semantic lookup traverses descendants, so changing only a button's
    // parent cannot alter the node selected for that button name.
    const simulatedContainer = { name: 'ArbitraryDesignerGroup', children: [] };
    for (const name of names) simulatedContainer.children.push({ name, children: [] });
    const findByName = (node, name) => node.name === name
        ? node
        : node.children.map(child => findByName(child, name)).find(Boolean) ?? null;
    for (const name of names) assert.equal(findByName(simulatedContainer, name)?.name, name);
});

test('directional lobby layout is owned by prefab widgets instead of runtime coordinate overrides', () => {
    const visibilityStart = source.indexOf('private applyLegacyRuntimeVisibility');
    const visibilityEnd = source.indexOf('private findDescendant', visibilityStart);
    const visibilitySource = source.slice(visibilityStart, visibilityEnd);
    assert.doesNotMatch(visibilitySource, /installLobbyViewportAdaptation/);
    assert.doesNotMatch(source, /alignLobbyRegionContent|alignLobbySemanticGroup|setWidgetAlignment/);
    assert.doesNotMatch(source, /const inset = 80|addEventListener\('resize'/);

    const byName = name => prefab.find(entry => entry?.__type__ === 'cc.Node' && entry._name === name);
    const component = (node, type) => (node._components ?? [])
        .map(reference => prefab[reference.__id__])
        .find(entry => entry?.__type__ === type);
    const expected = {
        LobbyMain: { flags: 80 },
        Top: { flags: 41 },
        Bottom: { flags: 44 },
        Left: { flags: 72, left: 250.727 },
        Right: { flags: 96, right: 80 },
        Player: { flags: 9, left: 112.5 },
        Balances: { flags: 33, right: 80 },
        Logout: { flags: 9, left: 80 },
        Version: { flags: 9, left: 80 },
        Shop: { flags: 12, left: 80 },
        Navigation: { flags: 32, right: 80 },
    };
    for (const [name, layout] of Object.entries(expected)) {
        const widget = component(byName(name), 'cc.Widget');
        assert.equal(widget?._alignFlags, layout.flags, `${name} Widget flags`);
        if ('left' in layout) assert.equal(widget?._left, layout.left, `${name} left inset`);
        if ('right' in layout) assert.equal(widget?._right, layout.right, `${name} right inset`);
    }
});

test('landscape viewport expands horizontally instead of letterboxing the lobby', () => {
    assert.match(
        bootstrapSource,
        /view\.setDesignResolutionSize\(1280, 720, ResolutionPolicy\.FIXED_HEIGHT\)/,
    );
    assert.doesNotMatch(
        bootstrapSource,
        /view\.setDesignResolutionSize\(1280, 720, ResolutionPolicy\.SHOW_ALL\)/,
    );
});
