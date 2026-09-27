import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL(
    '../../assets/Games/Poker/CX/Code/CD299LandscapeRoomViewComponent.ts', import.meta.url), 'utf8');

test('CD299 reconciles selected split cards after authoritative hand recreation', () => {
    const handRender = source.match(/public showHand[\s\S]*?private playDealTween/)?.[0] ?? '';
    assert.match(handRender, /Promise\.all\(cards\.map/);
    assert.match(handRender, /this\.cardGenerations\.get\(seat\) !== generation/);
    assert.match(handRender, /this\.selectedSplitCards\.length === 0/);
    assert.match(handRender, /this\.renderSplitSelection\(\)/);
    assert.ok(
        handRender.indexOf('this.renderSplitSelection()') > handRender.indexOf('Promise.all(cards.map'),
        'split slots must reconcile only after every replacement hand node exists',
    );
});

test('CD299 split reconciliation removes stale slot nodes before adopting current cards', () => {
    const splitRender = source.match(/private renderSplitSelection[\s\S]*?private clearSplitSelection/)?.[0] ?? '';
    assert.match(splitRender, /represented !== value\) child\.destroy\(\)/);
    assert.match(splitRender, /const card = value === undefined \? null : this\.localCardNodes\.get\(value\)/);
    assert.match(splitRender, /if \(card\.parent !== runtime\)/);
    assert.match(splitRender, /runtime\.addChild\(card\)/);
});

test('CD299 keeps migrating and returned cards active while hiding selected cards still in Hand', () => {
    const selection = source.match(/private toggleSplitCard[\s\S]*?private renderSplitSelection/)?.[0] ?? '';
    const reflow = selection.match(/private reflowLocalSplitHand[\s\S]*?\n    }/)?.[0] ?? '';
    assert.match(selection, /source\.active = true;\s*if \(selecting\) this\.reflowLocalSplitHand\(\)/);
    assert.match(selection, /destination\.addChild\(source\);[\s\S]*?if \(!selecting\) this\.reflowLocalSplitHand\(\)/);
    assert.match(reflow, /card\.active = true/);
    assert.match(reflow, /node\.active = node\.parent !== hand/);
});
