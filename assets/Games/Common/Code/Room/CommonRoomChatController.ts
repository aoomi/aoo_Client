import type { CommonRoomSocialController } from './CommonRoomSocialController';

export interface CommonRoomChatWindowPort {
    open(actions: CommonRoomChatActions): Promise<void> | void;
    close(): void;
    destroy(): void;
}

export interface CommonRoomChatActions {
    sendText(text: string): Promise<unknown>;
    sendQuick(identity: string): Promise<unknown>;
    sendExpression(identity: string): Promise<unknown>;
    close(): void;
}

/** Owns the one shared chat window; game adapters translate semantic commands. */
export class CommonRoomChatController {
    private openPending: Promise<void> | null = null;
    private opened = false;
    private destroyed = false;
    private sequence = 0;
    private generation = 0;

    public constructor(
        private readonly social: CommonRoomSocialController,
        private readonly window: CommonRoomChatWindowPort,
    ) {}

    public open(): Promise<void> {
        this.assertAlive();
        if (this.opened) return Promise.resolve();
        if (this.openPending) return this.openPending;
        const generation = this.generation;
        const operation = Promise.resolve(this.window.open({
            sendText: value => this.send('chat.text', { text: this.text(value) }),
            sendQuick: identity => this.send('chat.quick', { identity: this.text(identity) }),
            sendExpression: identity => this.send('chat.expression', { identity: this.text(identity) }),
            close: () => this.close(),
        })).then(() => { if (!this.destroyed && generation === this.generation) this.opened = true; }).finally(() => {
            if (this.openPending === operation) this.openPending = null;
        });
        this.openPending = operation;
        return operation;
    }

    public close(): void {
        if (!this.opened && !this.openPending) return;
        this.generation += 1;
        this.opened = false;
        this.openPending = null;
        this.window.close();
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.generation += 1;
        this.opened = false;
        this.openPending = null;
        this.window.destroy();
    }

    private send(command: string, payload: Readonly<Record<string, unknown>>): Promise<unknown> {
        return this.social.send(command, payload, `chat:${++this.sequence}`);
    }

    private text(value: string): string {
        const normalized = String(value ?? '').trim();
        if (!normalized) throw new Error('COMMON_ROOM_CHAT_VALUE_REQUIRED');
        return normalized;
    }

    private assertAlive(): void {
        if (this.destroyed) throw new Error('COMMON_ROOM_CHAT_DESTROYED');
    }
}
