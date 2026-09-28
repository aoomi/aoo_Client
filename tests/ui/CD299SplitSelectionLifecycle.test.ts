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
    assert.match(selection, /destination\.addChild\(source\);[\s\S]*?if \(!selecting\) \{[\s\S]*?this\.reflowLocalSplitHand\(\)/);
    assert.match(reflow, /card\.active = true/);
    assert.match(reflow, /node\.active = node\.parent !== hand/);
});

test('CD299 returned card replaces its slot listener with one Hand selection listener', () => {
    const returned = source.match(/destination\.addChild\(source\);[\s\S]*?this\.renderSplitSelection\(\)/)?.[0] ?? '';
    assert.match(returned, /if \(!selecting\) \{[\s\S]*?this\.bindLocalHandSelection\(source, rawCard\)/);
    const handBinder = source.match(/private bindLocalHandSelection[\s\S]*?private playDealTween/)?.[0] ?? '';
    assert.match(handBinder, /card\.off\(Node\.EventType\.MOUSE_UP, undefined, this\)/);
    assert.match(handBinder, /card\.off\(Node\.EventType\.TOUCH_END, undefined, this\)/);
    assert.match(handBinder, /card\.on\(Node\.EventType\.MOUSE_UP, selectCard, this\)/);
    assert.match(handBinder, /card\.on\(Node\.EventType\.TOUCH_END, selectCard, this\)/);
    assert.match(source.match(/public showHand[\s\S]*?private playDealTween/)?.[0] ?? '',
        /this\.bindLocalHandSelection\(card, rawCard\)/);

    const bindBody = handBinder.match(/private bindLocalHandSelection\([^)]*\): void \{([\s\S]*?)\n    \}/)?.[1];
    const returnBody = source.match(/const returnCard = \(\): void => \{([\s\S]*?)\n                \};/)?.[1];
    assert.ok(bindBody && returnBody, 'production event handlers must be extractable');
    const Node = { EventType: { MOUSE_UP: 'mouse-up', TOUCH_END: 'touch-end' } };
    const handlers = new Map<string, Set<() => void>>();
    const card = {
        off(type: string) { handlers.delete(type); },
        on(type: string, handler: () => void) {
            if (!handlers.has(type)) handlers.set(type, new Set());
            handlers.get(type)!.add(handler);
        },
        emit(type: string) { for (const handler of handlers.get(type) ?? []) handler(); },
    };
    const view = {
        splitSelectionEnabled: true,
        selectedSplitCards: [11, 22],
        lastCardSelectionAt: new Map<number, number>(),
        toggleSplitCard(value: number) {
            const index = this.selectedSplitCards.indexOf(value);
            if (index >= 0) this.selectedSplitCards.splice(index, 1);
            else this.selectedSplitCards.push(value);
        },
    };
    const returnCard = new Function('value', `return () => {${returnBody}}`).call(view, 11);
    card.on(Node.EventType.MOUSE_UP, returnCard);
    card.emit(Node.EventType.MOUSE_UP);
    assert.equal(view.selectedSplitCards.length, 1, 'slot event returns one selected card');

    const bindHand = new Function('card', 'rawCard', 'Node', bindBody.replace('(): void =>', '() =>'));
    bindHand.call(view, card, 11, Node);
    assert.equal(handlers.get(Node.EventType.MOUSE_UP)?.size, 1, 'old slot listener is replaced');
    card.emit(Node.EventType.MOUSE_UP);
    assert.equal(view.selectedSplitCards.length, 1, 'synthetic duplicate inside 250 ms is ignored');
    view.lastCardSelectionAt.set(11, Date.now() - 300);
    card.emit(Node.EventType.MOUSE_UP);
    assert.equal(view.selectedSplitCards.length, 2, 'the same returned node can be selected again');

    const rebuiltHandlers = new Map<string, Set<() => void>>();
    const rebuiltCard = {
        off(type: string) { rebuiltHandlers.delete(type); },
        on(type: string, handler: () => void) {
            if (!rebuiltHandlers.has(type)) rebuiltHandlers.set(type, new Set());
            rebuiltHandlers.get(type)!.add(handler);
        },
    };
    bindHand.call(view, rebuiltCard, 11, Node);
    bindHand.call(view, rebuiltCard, 11, Node);
    assert.equal(rebuiltHandlers.get(Node.EventType.MOUSE_UP)?.size, 1,
        'authoritative Hand recreation does not accumulate listeners');
});
