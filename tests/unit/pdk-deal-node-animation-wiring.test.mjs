import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const controller = fs.readFileSync(new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts', import.meta.url), 'utf8');
const animation = fs.readFileSync(new URL('../../assets/Games/Poker/Common/Spine/PokerDealNodeAnim.ts', import.meta.url), 'utf8');

test('PDK initial hand uses the shared poker node-deal animation once per round', () => {
    assert.match(controller, /import \{ PokerDealNodeAnim \} from '\.\.\/\.\.\/\.\.\/\.\.\/Common\/Spine\/PokerDealNodeAnim'/);
    assert.match(controller, /renderHand\(this\.shouldAnimateDeal\(setInfo\)\)/);
    assert.match(controller, /await PokerDealNodeAnim\.play\(this\.cardNodes, \[origin\]\)/);
    assert.match(controller, /const key = `\$\{this\.roomId\(\)\}:\$\{roundNo\}`/);
    assert.match(controller, /if \(this\.lastDealAnimationKey === key\) return false/);
});

test('all cards are staged at the deal origin before delayed batches begin', () => {
    assert.match(animation, /targetPosition: card\.worldPosition\.clone\(\)/);
    assert.match(animation, /card\.setWorldPosition\(origin\.worldPosition\)/);
    assert.match(animation, /card\.setScale\(config\.startScale/);
    assert.ok(animation.indexOf('const plans = cards.flatMap') < animation.indexOf('const batches: Promise<void>[]'));
});
