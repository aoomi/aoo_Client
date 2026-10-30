import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const clientRoot = new URL('../..', import.meta.url).pathname;
const controller = readFileSync(`${clientRoot}/assets/Common/Code/UI/CommonHeadController.ts`, 'utf8');
const seats = readFileSync(`${clientRoot}/assets/Games/Poker/PDK/Common/Code/Runtime/Room/PdkSeatPresenter.ts`, 'utf8');

test('common head uses one canvas-coordinate direction for text, voice and ready', () => {
    assert.match(controller, /view\.getVisibleSize\(\)/);
    assert.match(controller, /view\.getVisibleOrigin\(\)/);
    assert.match(controller, /this\.avatar\.worldPosition\.x < visibleCenterX \? 'right' : 'left'/);
    assert.match(controller, /activateDirectedPair\(this\.chatLeft, this\.chatRight\)/);
    assert.match(controller, /activateDirectedPair\(this\.voiceLeft, this\.voiceRight\)/);
    assert.match(controller, /applyReadyDirection\(this\.direction\(\)\)/);
    assert.doesNotMatch(controller, /physicalSlot|dataSeat/i);
});

test('PDK seat presenter contains layout only; CommonRoom owns public Head transient state', () => {
    assert.match(seats, /createSeatEntries/);
    assert.match(seats, /hideReadyStates\(\): void \{\}/);
    assert.doesNotMatch(seats, /CommonHeadController|controller\(|showQuickText|showVoice|showEmoji|hideEmoji/);
    assert.doesNotMatch(seats, /ChatBubbleLeft['"], true/);
    assert.doesNotMatch(seats, /VoiceLeft['"], true/);
    assert.doesNotMatch(seats, /ChatEffects\/\/ChatBubbleRight/);
});
