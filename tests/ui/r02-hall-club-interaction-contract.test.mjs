import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (relative) => readFile(new URL(`../../assets/${relative}`, import.meta.url), 'utf8');
const expectAll = (text, tokens, label) => {
    for (const token of tokens) assert.ok(text.includes(token), `${label}: missing ${token}`);
};

const [forms, lobby, lobbyEntry, clubMain, interaction, scroll, unifiedInput] = await Promise.all([
    source('Common/Code/Runtime/ui/LegacyFormManager.ts'),
    source('Lobby/Code/LobbyScreenController.ts'),
    source('Lobby/Code/ClubList/LobbyClubEntryController.ts'),
    source('Club/Code/Runtime/LegacyClubMainController.ts'),
    source('Common/Code/UI/Interaction.ts'),
    source('Common/Code/UI/UnifiedScroll.ts'),
    source('Common/Code/UI/UnifiedInput.ts'),
]);

// All migrated hall/club forms go through one native-prefab-only lifecycle and
// one interaction adapter. This prevents controllers from restoring old prefab
// loaders or inventing incompatible per-screen input/scroll behavior.
expectAll(forms, [
    "throw new Error(`缺少 Creator 3.8.8 原生 Prefab: ${path}`)",
    'bindLegacyFallbackInteractions(instance, path, onLegacyUiEvent)',
    "eventType: 'button-click'",
    "attachEditbox('editbox-began', 'OnEditBox_Began')",
    "attachEditbox('editbox-ended', 'OnEditBox_End')",
    "attachEditbox('editbox-return', 'OnEditBox_Return')",
    "eventType: 'scroll'",
    "eventType: 'pageview'",
], 'native form interaction adapter');

// Modal stacking must place a real input blocker immediately below the top
// modal, while Android/desktop back closes only the top non-base form.
expectAll(forms, [
    "new Node('LegacyModalInputMask')",
    'this.modalMask.addComponent(BlockInputEvents)',
    'const topModal = [...visible].reverse().find((entry) => entry.form.modal)',
    'this.modalMask.setSiblingIndex(sibling++)',
    'public back(): boolean',
    'if (!form?.isShown() || form.zOrder <= 0) continue',
], 'modal mask and back stack');

// Concurrent form opens are coalesced, cancelled loads cannot flash after a
// close/scene exit, and loading is reference counted instead of toggled by the
// first request to finish.
expectAll(forms, [
    'private readonly creating = new Map',
    'if (pending) {',
    'pending.args = args',
    'this.pathEpoch.set(path, (this.pathEpoch.get(path) ?? 0) + 1)',
    'this.cancelPending(path)',
    'private loadingCount = 0',
    'this.loadingCount = Math.max(0, this.loadingCount + delta)',
], 'async form race handling');

expectAll(lobby, [
    'private readonly mainButtonTapGuard = new Map<string, number>()',
    'if (routeNow - lastRoute < 220) return',
    'private readonly mainActionBusy = new Set<string>()',
    'this.formLoadingTimer = globalThis.setTimeout',
    '}, 120)',
    "this.forms.close('UIWaitForm')",
    'const handled = this.forms?.back() ?? false',
], 'hall duplicate click, loading flash and back handling');

// The lobby bridge owns list/create/enter orchestration; the legacy club
// surface remains the compatibility implementation for hydrated club views.
expectAll(lobbyEntry, [
    'new LegacyJoinClubController(this.forms, this.client).install()',
    'new LegacyClubMainController(',
    "this.forms.register('UILobbyClubList'",
    'private readonly enteringClubIds = new Set<number>()',
], 'lobby club entry bridge');

// Empty and error paths remain actionable instead of leaving the old hall
// hidden underneath a blank club layer.
expectAll(clubMain, [
    "this.setCollectionState(panel, clubs.length > 0 ? 'content' : 'empty')",
    "this.setCollectionState(panel, 'error')",
    'this.mainNode.active = true',
    'this.onReturnLobby()',
    "this.findDescendant(form.node, 'EditBox')?.getComponent(EditBox)",
    "if (edit) edit.string = ''",
    'scroll.scrollToOffset(offset, 0.16, true)',
], 'club empty/error/input/scroll/return behavior');

// Club room/member views must keep their listener lifetimes bounded and expose
// the principal return, paging and async-repeat guards.
expectAll(clubMain, [
    "if (['btn_close', 'btn_back', 'btn_closeshare', 'btn_bg'].includes(node.name))",
    'this.onClick(node, () => this.forms.close(path))',
    'private invitePending = false',
    'if (this.invitePending || this.inviteCandidatePid <= 0)',
    'if (epoch === this.inviteEpoch) this.invitePending = false',
    "this.onClick(node('btn_room_last'), () => this.scrollRooms(-1))",
    "this.onClick(node('btn_room_next'), () => this.scrollRooms(1))",
    'this.clearRoomListeners()',
    'this.clearQuickRoomListeners()',
], 'club navigation and repeat guards');

expectAll(interaction, [
    'export class GuardedButton',
    'finally { this.busy = false',
    'export class PopupStack',
    'export class BackKeyRouter',
    'export class RequestState',
], 'shared interaction components');
expectAll(scroll, ['export class UnifiedScroll', 'export class VirtualList<T>', 'export class Pagination'], 'shared scroll components');
expectAll(unifiedInput, ['export class UnifiedInput', "return value.length > 0 && (!this.numeric || /^\\d+$/.test(value))"], 'shared input component');

console.log('R02 hall/club interaction contracts passed');
