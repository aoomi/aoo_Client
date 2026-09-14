import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const clientRoot = new URL('../..', import.meta.url).pathname;
const controller = readFileSync(`${clientRoot}/assets/Common/Code/UI/CommonHeadController.ts`, 'utf8');
const seats = readFileSync(`${clientRoot}/assets/Games/Poker/PDK/Common/Code/Runtime/Room/SeatPresenter.ts`, 'utf8');

test('common head uses one canvas-coordinate direction for text, voice and ready', () => {
    assert.match(controller, /view\.getVisibleSize\(\)/);
    assert.match(controller, /view\.getVisibleOrigin\(\)/);
    assert.match(controller, /this\.avatar\.worldPosition\.x < visibleCenterX \? 'right' : 'left'/);
    assert.match(controller, /activateDirectedPair\(this\.chatLeft, this\.chatRight\)/);
    assert.match(controller, /activateDirectedPair\(this\.voiceLeft, this\.voiceRight\)/);
    assert.match(controller, /applyReadyDirection\(this\.direction\(\)\)/);
    assert.doesNotMatch(controller, /seat|physicalSlot|dataSeat/i);
});

test('PDK delegates public head transient state without duplicating direction checks', () => {
    assert.match(seats, /controller\(dataSeat\)\?\.showQuickText\(text\)/);
    assert.match(seats, /controller\(dataSeat\)\?\.showVoice\(\)/);
    assert.match(seats, /controller\.showReady/);
    assert.doesNotMatch(seats, /ChatBubbleLeft['"], true/);
    assert.doesNotMatch(seats, /VoiceLeft['"], true/);
    assert.doesNotMatch(seats, /ChatEffects\/\/ChatBubbleRight/);
});
