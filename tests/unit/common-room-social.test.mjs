import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => fs.readFileSync(path.join(root, 'assets/Games/Common/Code/Room', name), 'utf8');
const social = read('CommonRoomSocialController.ts');
const chat = read('CommonRoomChatController.ts');
const voice = read('CommonRoomVoiceController.ts');
const runtimeEntry = fs.readFileSync(path.join(root, 'assets/Games/Common/Code/Runtime/GameRuntimeEntry.ts'), 'utf8');
const runtimeEntries = fs.readFileSync(path.join(root, 'assets/Games/Common/Code/Runtime/GameRuntimeEntries.ts'), 'utf8');
const networkMount = read('RoomNetworkControllerMount.ts');

test('social transport sends one operation and deduplicates one event identity', () => {
    assert.match(social, /const existing = this\.pending\.get\(normalizedOperation\)/);
    assert.match(social, /if \(existing\) return existing/);
    assert.match(social, /this\.seen\.has\(identity\)/);
    assert.match(social, /identity \?\? record\.messageId \?\? record\.eventId/);
    assert.match(social, /for \(const dispose of this\.disposers\.splice\(0\)\) dispose\(\)/);
});

test('actual chat voice and magic sends emit one sanitized diagnostic after transport invocation', () => {
    assert.match(social, /const sent = this\.transport\.send\(normalizedCommand, Object\.freeze\(\{ \.\.\.payload \}\)\);\s*this\.traceSend\(normalizedCommand\)/);
    assert.match(social, /command\.startsWith\('chat\.'\) \? 'chat'/);
    assert.match(social, /command === 'voice' \? 'voice'/);
    assert.match(social, /command === 'magic\.expression' \|\| command === 'magicExpression' \? 'magicExpression'/);
    assert.match(social, /console\.info\(Object\.freeze\(\{ stage: 'send', capability \}\)\)/);
    assert.doesNotMatch(social, /console\.info\([^\n]*(payload|room|account|player|message|asset|token)/i);
});

test('single-flight duplicate does not emit another send diagnostic and unknown commands stay silent', () => {
    const existing = social.indexOf('if (existing) return existing');
    const transport = social.indexOf('const sent = this.transport.send');
    const diagnostic = social.indexOf('this.traceSend(normalizedCommand)');
    assert.ok(existing >= 0 && existing < transport && transport < diagnostic);
    assert.match(social, /if \(!capability\) return/);
    assert.doesNotMatch(social, /stage: 'success'|stage: 'sent'|sendSuccess/);
});

test('common runtime owns normalized social subscriptions and controller owns disposal', () => {
    assert.match(runtimeEntry, /const seen = new Set<string>\(\)/);
    assert.match(runtimeEntry, /String\(value \?\? ''\)\.trim\(\)/);
    assert.match(runtimeEntry, /if \(seen\.has\(event\)\) continue/);
    assert.match(runtimeEntries, /this\.social\.listen\(event\)/);
    assert.match(social, /this\.disposers\.push\(this\.transport\.subscribe\(event, listener\)\)/);
    assert.match(social, /for \(const dispose of this\.disposers\.splice\(0\)\) dispose\(\)/);
    assert.doesNotMatch(runtimeEntries, /transport\.subscribe|ports\.socialTransport\.subscribe/);
});

test('empty event collection performs no subscription and invalid event fails closed', () => {
    assert.match(runtimeEntry, /events: readonly string\[\] = \[\]/);
    assert.match(runtimeEntry, /if \(!event\) throw new Error\('COMMON_ROOM_SOCIAL_EVENT_REQUIRED'\)/);
    assert.match(runtimeEntries, /for \(const event of normalizeCommonRoomSocialEvents/);
    assert.doesNotMatch(runtimeEntries, /catch[^}]*COMMON_ROOM_SOCIAL_EVENT_REQUIRED/s);
});

test('chat and voice each own a single window or capture operation', () => {
    assert.match(chat, /if \(this\.openPending\) return this\.openPending/);
    assert.match(chat, /this\.window\.destroy\(\)/);
    assert.match(voice, /if \(this\.pending\) return this\.pending/);
    assert.match(voice, /generation !== this\.generation \|\| this\.destroyed/);
    assert.match(voice, /this\.capture\.destroy\(\)/);
    assert.match(voice, /this\.window\.destroy\(\)/);
});

test('social controllers expose only semantic opaque ports', () => {
    const all = `${social}\n${chat}\n${voice}`;
    assert.doesNotMatch(all, /remainingCards|replayCode|cardType|fanType|scoreDelta|winScore|loseScore|PDK|CD101|Mahjong/i);
    assert.doesNotMatch(all, /Games\/Poker|Games\/Mahjong/);
});

test('Common default social-media session fails closed and destroys in strict order', () => {
    for (const code of [
        'COMMON_ROOM_DEFAULT_DEPENDENCIES_REQUIRED', 'COMMON_ROOM_MEDIA_ENDPOINT_REQUIRED',
        'COMMON_ROOM_VOICE_RECORDER_REQUIRED', 'COMMON_ROOM_CHAT_FORM_REQUIRED', 'COMMON_ROOM_VOICE_FORM_REQUIRED',
    ]) assert.match(networkMount, new RegExp(code));
    const destroyStart = networkMount.indexOf('const destroy = (): void => {');
    const destroyEnd = networkMount.indexOf('\n        };', destroyStart);
    const destroy = destroyStart >= 0 && destroyEnd > destroyStart
        ? networkMount.slice(destroyStart, destroyEnd) : '';
    assert.ok(destroy, 'default session destroy block missing');
    const cancel = destroy.indexOf('media?.cancel()');
    const voice = destroy.indexOf("close('room/VoiceRecordingPanel'");
    const chat = destroy.indexOf("close('room/ChatPanel'");
    const listeners = destroy.indexOf('listeners.splice(0)');
    assert.ok(cancel >= 0 && voice > cancel && chat > voice && listeners > chat);
    assert.match(networkMount, /\{ stage, capability,[\s\S]*errorCode:/);
    assert.doesNotMatch(networkMount, /console\.(?:info|error)\([^\n]*(?:token|bearer|assetId|bytes|player|roomId)/i);
});

test('Common default chat and voice bind one session without gameplay listeners', () => {
    assert.match(networkMount, /chatWindow: Object\.freeze/);
    assert.match(networkMount, /voiceCapture: Object\.freeze/);
    assert.match(networkMount, /voiceWindow: Object\.freeze/);
    assert.match(networkMount, /new VoiceMediaClient\(apiBaseUrl, dependencies\.bearer, dependencies\.context, recorder\)/);
    assert.match(networkMount, /sessions\?\.add\(destroy\)/);
    assert.match(networkMount, /for \(const destroy of \[\.\.\.this\.commonSessions\]\) destroy\(\)/);
});
