import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const controller = fs.readFileSync('assets/Modules/GiftRoomCard/Code/GiftRoomCardController.ts', 'utf8');
const registry = fs.readFileSync('assets/Common/Code/Runtime/ui/ModulePrefabRegistry.ts', 'utf8');
const lobby = fs.readFileSync('assets/Lobby/Code/LobbyScreenController.ts', 'utf8');

test('gift-room-card UI uses the authoritative service and shared numpad', () => {
    for (const token of [
        'GiftRoomCardController',
        "this.api.send(recipient, 'ROOM_CARD'",
        'if (this.sending) return',
        'this.forms.loadCommonNumpad()',
        'legacy-gifting-sent',
        'legacy-gift-received',
        'watchInbox',
        'inboxCursor',
    ]) assert.ok(controller.includes(token), token);
    assert.doesNotMatch(controller, /EventManager|CacheData|CommonHandler|HomeKeyboardWindow/);
    assert.match(registry, /UILobbyGift: \{ bundle: 'gift-room-card-ui', asset: 'Prefab\/GiftRoomCard' \}/);
    assert.match(lobby, /case 'GiftRoomCard':[\s\S]*?this\.giftingController\?\.open\(\)/);
    assert.match(lobby, /'GiftRoomCard'[\s\S]*?visibleNodeNames/);
});

test('gift-room-card controller releases requests, keyboard and bindings', () => {
    assert.match(controller, /public destroy\(\): void \{[\s\S]*this\.api\.destroy\(\);[\s\S]*this\.clearBindings\(\);/);
    assert.match(controller, /this\.keyboard\?\.dispose\(\);/);
    assert.match(controller, /for \(const dispose of this\.disposers\.splice\(0\)\) dispose\(\);/);
});
