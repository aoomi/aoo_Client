import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const controller = fs.readFileSync(new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts', import.meta.url), 'utf8');
const animation = fs.readFileSync(new URL('../../assets/Games/Poker/Common/Spine/PokerDealNodeAnim.ts', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkRuntime.ts', import.meta.url), 'utf8');

test('PDK initial hand uses the shared poker node-deal animation once per round', () => {
    assert.match(controller, /import \{ PokerDealNodeAnim \} from '\.\.\/\.\.\/\.\.\/\.\.\/Common\/Spine\/PokerDealNodeAnim'/);
    assert.match(controller, /Boolean\(packet\.dealBoundary\) && this\.shouldAnimateDeal\(setInfo\)/);
    assert.match(controller, /renderHand\(animateDeal, authorityHand\)/);
    assert.match(controller, /await PokerDealNodeAnim\.play\(this\.cardNodes, \[origin\], \{/);
    assert.match(controller, /const dealDuration = 1/);
    assert.match(controller, /const cardDuration = dealDuration \/ this\.cardNodes\.length/);
    assert.match(controller, /batchSize: 1/);
    assert.match(controller, /batchInterval: cardDuration/);
    assert.match(controller, /moveDuration: cardDuration/);
    assert.match(controller, /travelFromOrigin: false/);
    assert.match(controller, /startScale: 1/);
    assert.match(controller, /startOpacity: 96/);
    assert.match(controller, /revealOffsetY: 0/);
    assert.match(controller, /const key = `\$\{this\.roomId\(\)\}:\$\{roundNo\}`/);
    assert.match(controller, /if \(this\.lastDealAnimationKey === key\) return false/);
    const decision = controller.slice(controller.indexOf('private shouldAnimateDeal'),
        controller.indexOf('public async waitForRoundEndPresentation'));
    assert.doesNotMatch(decision, /setInfo\.(?:tableOperations|playHistory|playedCardList)/,
        'cross-round authority ledgers are not a deal-boundary source');
    assert.match(decision, /this\.lastDealAnimationKey === key/);
});

test('all cards are staged before delayed batches begin and in-place dealing does not zoom', () => {
    assert.match(animation, /targetPosition: card\.worldPosition\.clone\(\)/);
    assert.match(animation, /if \(config\.travelFromOrigin\) \{[\s\S]*?card\.setWorldPosition\(origin\.worldPosition\)/);
    assert.match(animation, /card\.setScale\(plan\.targetScale\)/);
    assert.match(animation, /plan\.opacity\.opacity = 0/);
    assert.match(animation, /if \(!options\.travelFromOrigin\) opacity\.opacity = options\.startOpacity/);
    assert.match(animation, /plan\.targetPosition\.y - config\.revealOffsetY/);
    assert.ok(animation.indexOf('const plans = cards.flatMap') < animation.indexOf('const batches: Promise<void>[]'));
});

test('the first live PLAYING snapshot emits a deal boundary but static restore does not', () => {
    const boundary = runtime.slice(runtime.indexOf('// A live create/join response'),
        runtime.indexOf('private applyDissolveVote'));
    assert.match(boundary, /previousPhase !== view\.phase && \(Boolean\(previousPhase\) \|\| !force\)/);
    assert.match(runtime, /dealBoundary: liveDealBoundary/);
    assert.match(boundary, /CommonPdk_AuthoritativePhaseChanged/);
    assert.match(boundary, /staticRestore: force/);
});
