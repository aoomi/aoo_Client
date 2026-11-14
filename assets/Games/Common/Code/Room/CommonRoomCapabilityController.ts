import { Button, Node, Widget } from 'cc';
import type { CommonRoomChatController } from './CommonRoomChatController';
import type { CommonRoomVoiceController } from './CommonRoomVoiceController';
import type { RoomSettlementHistory } from './RoomSettlementHistory';

export interface CommonRoomCapabilities {
    readonly more: boolean;
    readonly chat: boolean;
    readonly voice: boolean;
    readonly settlementHistory: boolean;
}

export interface CommonRoomCapabilityNodes {
    readonly moreButton?: Node | null;
    readonly moreMenu?: Node | null;
    readonly moreItems?: Node | null;
    readonly chatButton?: Node | null;
    readonly voiceButton?: Node | null;
    readonly settlementHistoryButton?: Node | null;
}

const COMMON_ROOM_PATHS = Object.freeze({
    moreButton: 'Btn/Btn_More',
    moreMenu: 'CardCounter/MoreMenu',
    moreItems: 'CardCounter/MoreMenu/MoreItems',
    chatButton: 'Btn/Btn_Chat',
    voiceButton: 'Btn/Btn_Voice',
    settlementHistoryButton: 'Btn/Btn_SmallSettlement',
});

/** Common-owned layout request for the shared More menu. No Node escapes this port. */
export interface CommonRoomMoreMenuLayout {
    readonly x: number;
    readonly y: number;
    readonly z?: number;
}

/** Owns the shared CommonRoom entry bindings; feature packages only supply ports. */
export class CommonRoomCapabilityController {
    private readonly disposers: Array<() => void> = [];
    private installed = false;
    private destroyed = false;
    private moreOpened = false;
    private voicePressed = false;

    public constructor(
        rootOrNodes: Node | CommonRoomCapabilityNodes,
        private readonly capabilities: CommonRoomCapabilities,
        private readonly chat: CommonRoomChatController,
        private readonly voice: CommonRoomVoiceController,
        private readonly history: RoomSettlementHistory,
        private readonly report: (error: unknown) => void = () => undefined,
    ) {
        this.nodes = rootOrNodes instanceof Node ? this.resolveNodes(rootOrNodes) : rootOrNodes;
    }

    private readonly nodes: CommonRoomCapabilityNodes;

    public install(): void {
        this.assertAlive();
        if (this.installed) return;
        this.installed = true;
        this.trace('install');
        this.setEnabled(this.nodes.moreButton, this.capabilities.more);
        this.setEnabled(this.nodes.chatButton, this.capabilities.chat);
        this.setEnabled(this.nodes.voiceButton, this.capabilities.voice);
        this.setEnabled(this.nodes.settlementHistoryButton, this.capabilities.settlementHistory);
        if (this.nodes.moreItems) this.nodes.moreItems.active = false;
        if (this.capabilities.more) this.bindClick('more', this.nodes.moreButton, () => this.toggleMore());
        if (this.capabilities.chat) this.bindClick('chat', this.nodes.chatButton, () => this.run(this.chat.open()));
        if (this.capabilities.settlementHistory) {
            this.bindClick('settlementHistory', this.nodes.settlementHistoryButton, () => this.run(this.history.toggle()));
        }
        if (this.capabilities.voice) this.bindVoice(this.nodes.voiceButton);
    }

    public closeWindows(): void {
        this.closeMoreMenu();
        this.chat.close();
        this.history.close();
        if (this.voicePressed) this.voice.cancel();
        this.voicePressed = false;
    }

    /** Close the shared menu without synthesizing a Button event in gameplay. */
    public closeMoreMenu(): void {
        if (this.destroyed) return;
        this.moreOpened = false;
        if (this.nodes.moreItems?.isValid) this.nodes.moreItems.active = false;
    }

    /** Apply the shared menu's presentation layout while retaining Common ownership. */
    public setMoreMenuLayout(layout: CommonRoomMoreMenuLayout): void {
        this.assertAlive();
        if (!Number.isFinite(layout.x) || !Number.isFinite(layout.y)
            || (layout.z !== undefined && !Number.isFinite(layout.z))) {
            throw new Error('COMMON_ROOM_MORE_MENU_LAYOUT_INVALID');
        }
        const menu = this.nodes.moreMenu;
        if (!menu?.isValid) throw new Error('COMMON_ROOM_MORE_MENU_MISSING');
        const widget = menu.getComponent(Widget);
        if (widget) widget.enabled = false;
        menu.setPosition(layout.x, layout.y, layout.z ?? 0);
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.closeWindows();
        for (const dispose of this.disposers.splice(0)) dispose();
        this.chat.destroy();
        this.voice.destroy();
        this.history.destroy();
    }

    private toggleMore(): void {
        this.moreOpened = !this.moreOpened;
        if (this.nodes.moreItems?.isValid) this.nodes.moreItems.active = this.moreOpened;
    }

    private bindClick(capability: string, node: Node | null | undefined, action: () => void): void {
        if (!node?.isValid) return;
        let lastDispatchAt = -Infinity;
        const dispatch = (): void => {
            const now = Date.now();
            if (now - lastDispatchAt < 120) return;
            lastDispatchAt = now;
            this.trace('hit', capability);
            try {
                action();
                this.trace('handler', capability);
            } catch (error) {
                this.report(error);
            }
        };
        const handler = (): void => dispatch();
        const touchFallback = (): void => dispatch();
        // Creator's Button component emits CLICK for touch input, while the
        // desktop/browser preview can deliver a mouse release without the
        // touch sequence. Keep both paths on the same debounced dispatcher so
        // the shared shell behaves identically on mobile and in headless E2E.
        const mouseFallback = (): void => dispatch();
        node.on(Button.EventType.CLICK, handler, this);
        node.on(Node.EventType.TOUCH_END, touchFallback, this, true);
        node.on(Node.EventType.MOUSE_UP, mouseFallback, this, true);
        this.disposers.push(() => {
            if (!node.isValid) return;
            node.off(Button.EventType.CLICK, handler, this);
            node.off(Node.EventType.TOUCH_END, touchFallback, this, true);
            node.off(Node.EventType.MOUSE_UP, mouseFallback, this, true);
        });
    }

    private bindVoice(node: Node | null | undefined): void {
        if (!node?.isValid) return;
        const start = (): void => {
            if (this.voicePressed) return;
            this.trace('hit', 'voice');
            this.voicePressed = true;
            try {
                this.run(this.voice.start());
            } catch (error) {
                this.report(error);
                this.voicePressed = false;
            }
            this.trace('handler', 'voice');
        };
        const finish = (): void => {
            if (!this.voicePressed) return;
            this.voicePressed = false;
            this.voice.finish();
        };
        const cancel = (): void => {
            if (!this.voicePressed) return;
            this.voicePressed = false;
            this.voice.cancel();
        };
        for (const event of [Node.EventType.TOUCH_START, Node.EventType.MOUSE_DOWN]) node.on(event, start, this, true);
        for (const event of [Node.EventType.TOUCH_END, Node.EventType.MOUSE_UP]) node.on(event, finish, this, true);
        node.on(Node.EventType.TOUCH_CANCEL, cancel, this, true);
        this.disposers.push(() => {
            if (!node.isValid) return;
            for (const event of [Node.EventType.TOUCH_START, Node.EventType.MOUSE_DOWN]) node.off(event, start, this, true);
            for (const event of [Node.EventType.TOUCH_END, Node.EventType.MOUSE_UP]) node.off(event, finish, this, true);
            node.off(Node.EventType.TOUCH_CANCEL, cancel, this, true);
        });
    }

    private setEnabled(node: Node | null | undefined, enabled: boolean): void {
        if (!node?.isValid) return;
        node.active = enabled;
        const button = node.getComponent(Button);
        if (button) button.interactable = enabled;
    }

    private run(operation: Promise<unknown> | void): void {
        void Promise.resolve(operation).catch(this.report);
    }

    private assertAlive(): void {
        if (this.destroyed) throw new Error('COMMON_ROOM_CAPABILITY_DESTROYED');
    }

    private resolveNodes(root: Node): CommonRoomCapabilityNodes {
        const node = (path: string): Node | null => {
            const exact = root.getChildByPath(path);
            if (exact) return exact;
            // Creator revisions have occasionally flattened the Btn container.
            // Resolve by terminal name as a compatibility path, while keeping
            // the canonical prefab path authoritative when it exists.
            const terminal = path.slice(path.lastIndexOf('/') + 1);
            const visit = (candidate: Node): Node | null => {
                if (candidate.name === terminal) return candidate;
                for (const child of candidate.children) {
                    const found = visit(child);
                    if (found) return found;
                }
                return null;
            };
            return visit(root);
        };
        return {
            moreButton: node(COMMON_ROOM_PATHS.moreButton),
            moreMenu: node(COMMON_ROOM_PATHS.moreMenu),
            moreItems: node(COMMON_ROOM_PATHS.moreItems),
            chatButton: node(COMMON_ROOM_PATHS.chatButton),
            voiceButton: node(COMMON_ROOM_PATHS.voiceButton),
            settlementHistoryButton: node(COMMON_ROOM_PATHS.settlementHistoryButton),
        };
    }

    private trace(stage: 'install' | 'hit' | 'handler', capability?: string): void {
        console.info('[CommonRoomCapability]', { stage, capability });
    }
}
