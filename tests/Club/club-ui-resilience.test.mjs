import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.resolve(here, '../../assets/Club/Code/Runtime');
const read = (name) => fs.readFileSync(path.join(runtime, name), 'utf8');
const entry = fs.readFileSync(path.resolve(runtime, '../../../Lobby/Code/ClubList/LobbyClubEntryController.ts'), 'utf8');
const join = read('LegacyJoinClubController.ts');
const main = read('LegacyClubMainController.ts');

// Buttons and inputs: every request-producing entry point must reject a second tap.
for (const token of [
    'if (this.createPending) return;',
    'this.enteringClubIds.has(clubId)',
    'if (this.submitting) return;',
    'if (this.invitePending) return;',
    'if (this.switchingClubId !== 0) return;',
    'this.roomDetailPending.has(key)',
]) assert.ok(`${entry}\n${join}\n${main}`.includes(token), `missing repeated-click guard: ${token}`);

// Popup back/close paths and stale async completion invalidation.
for (const token of [
    "form.find('btn_close')",
    'onClose: () => { this.submissionEpoch += 1;',
    'onClose: () => { this.quickJoinEpoch += 1;',
    'epoch !== this.quickJoinEpoch || !form.node.isValid || !form.isShown()',
    'epoch !== this.submissionEpoch || !this.form?.isShown()',
    'epoch !== this.visualEpoch || !sprite.node.isValid',
    'loadClubSkinSpriteFrame(spec',
]) assert.ok(`${entry}\n${join}\n${main}`.includes(token), `missing popup lifecycle guard: ${token}`);

// Club-owned popup roots consume all touch phases so taps cannot reach the hall beneath.
for (const source of [entry, join, main]) {
    assert.ok(source.includes('private blockInput(node: Node)'), 'missing modal input shield');
    for (const phase of ['TOUCH_START', 'TOUCH_MOVE', 'TOUCH_END', 'TOUCH_CANCEL']) {
        assert.ok(source.includes(`Node.EventType.${phase}`), `missing input shield phase: ${phase}`);
    }
}

// Loading, empty, error and content states are mutually managed for list-like Club UI.
for (const state of ["'loading'", "'content'", "'empty'", "'error'"]) {
    assert.ok(main.includes(state), `missing collection state: ${state}`);
}
for (const alias of ['loadingNode', 'emptyNode', 'errorNode', 'noData']) {
    assert.ok(main.includes(alias), `missing compatible state-node alias: ${alias}`);
}

// Scroll movement remains bounded to actual rendered children.
assert.ok(main.includes("if (!layout || layout.children.length === 0) return;"));

// Input validation must happen before mutations reach the protocol client.
assert.ok(entry.indexOf('if (!name.trim())') < entry.indexOf("'club.CClubCreate'"));
assert.ok(join.indexOf('if (this.digits.length !== 6)') < join.indexOf("'club.CClubJoin'"));
assert.ok(main.indexOf("if (!/^[1-9]\\d*$/.test(value))") < main.indexOf("'club.CClubFindPIDInfo'"));

console.log('club UI resilience checks passed');
