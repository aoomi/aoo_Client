import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const clientRoot = new URL('../../', import.meta.url).pathname;
const pdkCommonRoot = join(clientRoot, 'assets/Games/Poker/PDK/Common');
const spineRoot = join(pdkCommonRoot, 'Spine');
const runtimeRoot = join(pdkCommonRoot, 'Code/Runtime');
const prefabPath = join(pdkCommonRoot, 'Prefab/PDK_CommonRoom.prefab');
const requiredAssets = [
    'zhadan/zhadan.json', 'liandui/ddz_game_paixing_ld_ani.json', 'sanbudai/sanbudai.json',
    'sandaiyi/sandaiyi.json', 'sandaier/sandaier.json', 'sandaiyidui/sidaidui.json',
    'sidaiyi/sidaiyi.json', 'sidaier/sidaiyi.json', 'sidaiyidui/sidaidui.json',
    'sidaisan/sidaisan.json', 'shunzi/ddz_game_paixing_sz_ani.json',
    'feiji/ddz_game_paixing_fjfeiji_ani.json', 'sanfeiji/ddz_game_paixing_cjfjfeiji_ani.json',
    'guanmen/guanmen.skel',
];

test('PDK card-pattern animation assets have one authoritative Common/Spine source', () => {
    for (const relative of requiredAssets) {
        const asset = join(spineRoot, relative);
        assert.equal(existsSync(asset), true, `${relative} missing`);
        assert.equal(existsSync(`${asset}.meta`), true, `${relative}.meta missing`);
    }
    const commonMeta = JSON.parse(readFileSync(`${pdkCommonRoot}.meta`, 'utf8'));
    assert.equal(commonMeta.userData?.isBundle, true);
    assert.equal(commonMeta.userData?.bundleName, 'paodekuai-common');
    const spineMeta = JSON.parse(readFileSync(`${spineRoot}.meta`, 'utf8'));
    assert.notEqual(spineMeta.userData?.isBundle, true, 'Spine must inherit the common PDK bundle');
});

test('PDK animation registry maps protocol card types to Common/Spine SkeletonData', () => {
    const registry = readFileSync(join(runtimeRoot, 'PdkAnimationRegistry.ts'), 'utf8');
    const resolver = readFileSync(join(runtimeRoot, 'PdkAnimationResolver.ts'), 'utf8');
    const presenter = readFileSync(join(runtimeRoot, 'Room/AnimationPresenter.ts'), 'utf8');
    const controller = readFileSync(join(runtimeRoot, 'CommonPdkPlayController.ts'), 'utf8');
    assert.match(registry, /PDK_ANIMATION_BUNDLE = 'paodekuai-common'/);
    for (const relative of requiredAssets) {
        const loadPath = `Spine/${relative.replace(/\.(json|skel)$/, '')}`;
        assert.match(registry, new RegExp(loadPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    for (const opType of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
        assert.match(registry, new RegExp(`(?:^|\\s)${opType}:`));
    }
    assert.match(resolver, /sp\.SkeletonData/);
    assert.match(resolver, /pdkAnimationDefinition\(folderKey\)\.assetPath/);
    assert.doesNotMatch(resolver, /AnimationClips|JsonAsset|AnimationClip|manifest/);
    assert.match(presenter, /pdkAnimationForOpCardType/);
    assert.match(controller, /playOperation\(opType\)/);
});

test('PDK room prefab contains the shared card-pattern animation mount nodes', () => {
    const prefab = JSON.parse(readFileSync(prefabPath, 'utf8'));
    const names = new Set(prefab.filter((entry) => entry?.__type__ === 'cc.Node').map((entry) => entry._name));
    for (const mount of ['Boom_Ani', 'Liandui_Spine', 'Sandaiyi_Spine', 'Sandaier', 'Sidaiyi', 'Sidaier', 'Sidaisan', 'Shunzi', 'Plane_Ani', 'Shut_Dow_Ani']) {
        assert.equal(names.has(mount), true, `${mount} mount missing`);
    }
});

test('deal and outgoing-card animations do not replay history or carry card shadows', () => {
    const controller = readFileSync(join(runtimeRoot, 'CommonPdkPlayController.ts'), 'utf8');
    const dealGate = controller.slice(
        controller.indexOf('private shouldAnimateDeal'),
        controller.indexOf('public async waitForRoundEndPresentation'),
    );
    assert.match(dealGate, /playHistory\.length > 0/);
    assert.match(dealGate, /hasPlayedCards/);
    const flight = controller.slice(
        controller.indexOf('private prepareOwnFlightCards'),
        controller.indexOf('private async flyCardsToOwnAction'),
    );
    assert.match(flight, /setPdkVisualState\(false, false\)/);
});

test('authority reconciliation removes flight copies and reflows an unchanged hand', () => {
    const controller = readFileSync(join(runtimeRoot, 'CommonPdkPlayController.ts'), 'utf8');
    const authority = controller.slice(
        controller.indexOf("if (event === 'CommonPdk_AuthoritativeState')"),
        controller.indexOf("} else if (event === 'CommonPdkSetStart')"),
    );
    assert.match(authority, /await this\.ownCardFlight;\s*this\.clearOwnLandingCards\(\)/);
    const render = controller.slice(
        controller.indexOf('private async renderHand'),
        controller.indexOf('private shouldAnimateDeal'),
    );
    assert.match(render, /nodeQueues[\s\S]*reconciledNodes[\s\S]*handLayout\.updateLayout\(\)[\s\S]*synchronizeLayout/);
});

test('local play compacts the surviving hand without a Layout jump frame', () => {
    const controller = readFileSync(join(runtimeRoot, 'CommonPdkPlayController.ts'), 'utf8');
    const compact = controller.slice(
        controller.indexOf('private buildHandCompactionPlan'),
        controller.indexOf('private schedulePublicCardsClear'),
    );
    assert.match(compact, /removedBefore \+ selectedCount \/ 2/);
    assert.match(compact, /tween\(card\)\.by\(HAND_COMPACT_DURATION_SECONDS/);
    assert.doesNotMatch(compact, /layout\.enabled = true|layout\.updateLayout\(\)/);
});

test('deal, light effects, trick cleanup, and More menu follow explicit UI boundaries', () => {
    const controller = readFileSync(join(runtimeRoot, 'CommonPdkPlayController.ts'), 'utf8');
    const resolver = readFileSync(join(runtimeRoot, 'PdkAnimationResolver.ts'), 'utf8');
    const authority = controller.slice(
        controller.indexOf("if (event === 'CommonPdk_AuthoritativeState')"),
        controller.indexOf("} else if (event === 'CommonPdkSetStart')"),
    );
    assert.doesNotMatch(authority, /renderHand\(this\.shouldAnimateDeal/);
    assert.match(controller, /to === 'PLAYING'[\s\S]*renderHand\(this\.shouldAnimateDeal\(setInfo\)\)/);
    const clear = controller.slice(
        controller.indexOf('private schedulePublicCardsClear'),
        controller.indexOf('private prepareOwnFlightCards'),
    );
    assert.match(clear, /if \(this\.runtime\.retainPlayedCardsOnTable\(\)\) return/);
    assert.match(clear, /clearPublicCards\(\);\s*this\.clearTableCards\(\)/);
    assert.match(controller, /getBoundingBoxToWorld\(\)[\s\S]*toggleMoreMenu\(\)/);
    assert.match(controller, /menu\.setSiblingIndex\(this\.view\.root\.children\.length - 1\)/);
    assert.match(resolver, /EVENT_AFTER_UPDATE/);
    assert.match(resolver, /glow\|halo\|guang\|gx_\|lizi\|diquan\|shadow\|ying/);
});
