/** A game adapter owns the wire protocol. Common only emits semantic commands and events. */
export interface CommonRoomSocialTransport {
    send(command: string, payload: Readonly<Record<string, unknown>>): Promise<unknown>;
    subscribe(event: string, listener: (payload: unknown) => void): () => void;
}

export interface CommonRoomSocialEvent {
    readonly identity: string;
    readonly kind: string;
    readonly payload: unknown;
}

export interface CommonRoomSocialRenderer {
    render(event: CommonRoomSocialEvent): void;
    clear(): void;
}

/**
 * Game-neutral social transport boundary. It owns single-flight sends, event
 * subscriptions and identity dedupe, but never interprets a game's payload.
 */
export class CommonRoomSocialController {
    private readonly pending = new Map<string, Promise<unknown>>();
    private readonly seen = new Set<string>();
    private readonly disposers: Array<() => void> = [];
    private destroyed = false;

    public constructor(
        private readonly transport: CommonRoomSocialTransport,
        private readonly renderer: CommonRoomSocialRenderer,
    ) {}

    public listen(event: string): void {
        this.assertAlive();
        if (!event.trim()) throw new Error('COMMON_ROOM_SOCIAL_EVENT_REQUIRED');
        const listener = (payload: unknown): void => this.receive(event, payload);
        this.disposers.push(this.transport.subscribe(event, listener));
    }

    public send(command: string, payload: Readonly<Record<string, unknown>>, operationId: string): Promise<unknown> {
        this.assertAlive();
        const normalizedCommand = command.trim();
        const normalizedOperation = operationId.trim();
        if (!normalizedCommand || !normalizedOperation) throw new Error('COMMON_ROOM_SOCIAL_COMMAND_REQUIRED');
        const existing = this.pending.get(normalizedOperation);
        if (existing) return existing;
        const sent = this.transport.send(normalizedCommand, Object.freeze({ ...payload }));
        this.traceSend(normalizedCommand);
        const operation = sent.finally(() => {
            if (this.pending.get(normalizedOperation) === operation) this.pending.delete(normalizedOperation);
        });
        this.pending.set(normalizedOperation, operation);
        return operation;
    }

    public receive(kind: string, payload: unknown): void {
        if (this.destroyed) return;
        const identity = this.identity(payload);
        if (!identity || this.seen.has(identity)) return;
        this.seen.add(identity);
        this.renderer.render(Object.freeze({ identity, kind, payload }));
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        for (const dispose of this.disposers.splice(0)) dispose();
        this.pending.clear();
        this.seen.clear();
        this.renderer.clear();
    }

    private identity(payload: unknown): string {
        if (!payload || typeof payload !== 'object') return '';
        const record = payload as Record<string, unknown>;
        return String(record.identity ?? record.messageId ?? record.eventId ?? '').trim();
    }

    private traceSend(command: string): void {
        const capability = command.startsWith('chat.') ? 'chat'
            : command === 'voice' ? 'voice'
                : command === 'magic.expression' || command === 'magicExpression' ? 'magicExpression' : null;
        if (!capability) return;
        console.info(Object.freeze({ stage: 'send', capability }));
    }

    private assertAlive(): void {
        if (this.destroyed) throw new Error('COMMON_ROOM_SOCIAL_DESTROYED');
    }
}
