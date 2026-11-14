import { LegacyPacketCodec, type LegacyIncomingFrame, type LegacyIncomingPacket } from './LegacyPacketCodec';
import { requireCanonicalWebSocketUrl } from './GatewayEntryPolicy';

interface PendingRequest {
    resolve(value: unknown): void;
    reject(reason: Error): void;
    timeoutId: number;
}

interface FragmentedPacket {
    readonly frame: LegacyIncomingFrame;
    readonly parts: Array<string | undefined>;
    received: number;
    timeoutId: number;
}

type SessionReplacementListener = () => void;

class ClientSessionLifecycle {
    private readonly clients = new Set<LegacyWebSocketClient>();
    private readonly listeners = new Set<SessionReplacementListener>();
    private frozen = false;
    private replacementDispatched = false;

    public register(client: LegacyWebSocketClient): void { this.clients.add(client); }
    public unregister(client: LegacyWebSocketClient): void { this.clients.delete(client); }
    public isFrozen(): boolean { return this.frozen; }
    public onReplacement(listener: SessionReplacementListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    public confirmReplacement(source: string, reasonCode: string): void {
        if (reasonCode !== 'SESSION_REPLACED' || this.replacementDispatched) return;
        this.replacementDispatched = true;
        this.frozen = true;
        this.log('replacement-freeze', { source, socketCount: this.clients.size });
        for (const client of Array.from(this.clients)) client.closeForSessionFreeze();
        for (const listener of this.listeners) listener();
    }
    public resumeAfterExplicitLogin(): void {
        if (!this.frozen && !this.replacementDispatched) return;
        this.frozen = false;
        this.replacementDispatched = false;
        this.log('explicit-login-unfreeze', {});
    }
    public log(event: string, detail: Readonly<Record<string, unknown>>): void {
        const runtime = globalThis as typeof globalThis & { __aoo_NETWORK_DIAGNOSTICS__?: boolean;
            __aoo_RUNTIME_CONFIG__?: { environment?: string } };
        if (runtime.__aoo_NETWORK_DIAGNOSTICS__ === true || runtime.__aoo_RUNTIME_CONFIG__?.environment === 'test') {
            console.info(`[SessionLifecycle] ${event}`, detail);
        }
    }
}

export const sessionLifecycle = new ClientSessionLifecycle();

export class LegacyWebSocketClient {
    private static readonly MAX_PENDING_REQUESTS = 256;
    private static nextClientId = 0;
    private readonly codec = new LegacyPacketCodec();
    private readonly pending = new Map<number, PendingRequest>();
    private readonly listeners = new Map<string, Set<(body: unknown) => void>>();
    private readonly activityListeners = new Set<() => void>();
    private readonly reconnectListeners = new Set<() => void>();
    private readonly closeListeners = new Set<(event: CloseEvent) => void>();
    private readonly fragments = new Map<string, FragmentedPacket>();
    private socket: WebSocket | null = null;
    private socketGeneration = 0;
    private sequence = 1;
    private endpoint = '';
    private intentionalClose = false;
    private readonly clientId = `ws-${++LegacyWebSocketClient.nextClientId}`;

    public constructor(private readonly owner = 'protocol-client') {
        sessionLifecycle.register(this);
        sessionLifecycle.log('client-created', { clientId: this.clientId, owner: this.owner });
    }

    public async connect(url: string, timeoutMs = 5000): Promise<void> {
        if (sessionLifecycle.isFrozen()) throw new Error('本客户端登录会话已冻结，请重新登录');
        this.close();
        sessionLifecycle.register(this);
        url = requireCanonicalWebSocketUrl(url);
        this.endpoint = url;
        this.intentionalClose = false;
        sessionLifecycle.log('connect', { clientId: this.clientId, owner: this.owner, endpoint: url });
        await this.openSocket(url, timeoutMs);
    }

    public updateReconnectEndpoint(url: string): void {
        void url;
    }

    public isConnected(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    private async openSocket(url: string, timeoutMs: number): Promise<void> {
        url = this.resolveSocketUrl(url);
        const generation = ++this.socketGeneration;
        const socket = new WebSocket(url, this.resolveSocketProtocols());
        socket.binaryType = 'arraybuffer';
        this.socket = socket;
        await new Promise<void>((resolve, reject) => {
            let settled = false;
            const settle = (error?: Error): void => {
                if (settled) return;
                settled = true;
                if (error) reject(error);
                else resolve();
            };
            const timeoutId = globalThis.setTimeout(() => {
                if (this.socketGeneration !== generation) return;
                socket.onopen = null;
                socket.onerror = null;
                socket.close();
                settle(new Error('连接大厅服务器超时'));
            }, timeoutMs);
            socket.onopen = () => {
                if (this.socketGeneration !== generation) {
                    globalThis.clearTimeout(timeoutId);
                    socket.close();
                    settle(new Error('连接已中断'));
                    return;
                }
                globalThis.clearTimeout(timeoutId);
                settle();
            };
            socket.onerror = () => {
                if (this.socketGeneration !== generation) {
                    globalThis.clearTimeout(timeoutId);
                    settle(new Error('连接已中断'));
                    return;
                }
                globalThis.clearTimeout(timeoutId);
                settle(new Error('无法连接大厅服务器'));
            };
        });
        if (this.socketGeneration !== generation) {
            socket.close();
            return;
        }
        socket.onmessage = (event) => this.handleMessage(event, generation);
        socket.onerror = null;
        socket.onclose = (event) => this.handleClose(socket, generation, event);
    }

    protected resolveSocketUrl(url: string): string {
        return requireCanonicalWebSocketUrl(url);
    }

    protected resolveSocketProtocols(): string | string[] | undefined {
        return undefined;
    }

    public request<T>(event: string, body: unknown, timeoutMs = 8000): Promise<T> {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error('大厅服务器尚未连接'));
        }
        return this.sendRequest<T>(event, body, timeoutMs);
    }

    private sendRequest<T>(event: string, body: unknown, timeoutMs: number): Promise<T> {
        if (this.pending.size >= LegacyWebSocketClient.MAX_PENDING_REQUESTS) {
            return Promise.reject(new Error('待处理请求过多'));
        }
        return new Promise<T>((resolve, reject) => {
            let preparedBody: unknown;
            let sequence: number;
            try {
                preparedBody = this.prepareOutboundBody(event, body);
                sequence = this.requestSequence(event, preparedBody) ?? this.nextSequence();
            } catch (error: unknown) {
                reject(error instanceof Error ? error : new Error(String(error)));
                return;
            }
            const timeoutId = globalThis.setTimeout(() => {
                this.pending.delete(sequence);
                reject(new Error(`${event} 请求超时`));
            }, timeoutMs);
            this.pending.set(sequence, { resolve: (value) => resolve(value as T), reject, timeoutId });
            this.socket!.send(this.encodeWire(event, preparedBody, sequence, false));
        });
    }

    public notify(event: string, body: unknown): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error('大厅服务器尚未连接');
        }
        this.sendNotify(event, body);
    }

    private sendNotify(event: string, body: unknown): void {
        const preparedBody = this.prepareOutboundBody(event, body);
        this.socket!.send(this.encodeWire(event, preparedBody, 0, true));
    }

    public on(event: string, listener: (body: unknown) => void): () => void {
        const key = event.toLowerCase();
        const set = this.listeners.get(key) ?? new Set<(body: unknown) => void>();
        set.add(listener);
        this.listeners.set(key, set);
        return () => set.delete(listener);
    }

    public onActivity(listener: () => void): () => void {
        this.activityListeners.add(listener);
        return () => this.activityListeners.delete(listener);
    }

    public onReconnect(listener: () => void): () => void {
        this.reconnectListeners.add(listener);
        return () => this.reconnectListeners.delete(listener);
    }

    public onClose(listener: (event: CloseEvent) => void): () => void {
        this.closeListeners.add(listener);
        return () => this.closeListeners.delete(listener);
    }

    public confirmSessionReplacement(source: string, reasonCode = 'SESSION_REPLACED'): void {
        sessionLifecycle.confirmReplacement(`${this.owner}:${this.clientId}:${source}`, reasonCode);
    }

    public closeForSessionFreeze(): void { this.close(); }

    public close(): void {
        this.intentionalClose = true;
        this.socketGeneration += 1;
        this.endpoint = '';
        if (this.socket) {
            this.socket.onclose = null;
            this.socket.close();
            this.socket = null;
        }
        this.rejectAll(new Error('连接已关闭'));
        this.clearListeners();
        this.clearFragments();
        sessionLifecycle.unregister(this);
    }

    private handleClose(socket: WebSocket, generation: number, event: CloseEvent): void {
        if (this.socket !== socket || generation !== this.socketGeneration) return;
        this.socket = null;
        this.clearFragments();
        sessionLifecycle.log('close', { clientId: this.clientId, owner: this.owner, code: event.code, reason: event.reason });
        if (event.code === 4001 && event.reason === 'SESSION_REPLACED') {
            sessionLifecycle.confirmReplacement(`${this.owner}:${this.clientId}:close-4001`, event.reason);
        }
        for (const listener of this.closeListeners) {
            try { listener(event); }
            catch (error) { console.error('处理大厅连接关闭事件失败', error); }
        }
        this.rejectAll(new Error('大厅服务器连接已断开'));
    }

    protected requestImmediate<T>(event: string, body: unknown, timeoutMs = 8000): Promise<T> {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error('大厅服务器尚未连接'));
        }
        return this.sendRequest<T>(event, body, timeoutMs);
    }

    private handleMessage(event: MessageEvent, generation: number): void {
        if (generation !== this.socketGeneration) return;
        if (!(event.data instanceof ArrayBuffer) && typeof event.data !== 'string') return;
        let packet: LegacyIncomingPacket;
        try {
            packet = this.decodeWire(event.data);
        }
        catch (error) {
            console.error('解析大厅封包失败', error);
            this.close();
            return;
        }
        // V2 room pushes carry the originating writer's sequence. On another
        // player's connection that number can equal an unrelated local request
        // sequence. A push must never resolve a pending response solely because
        // those connection-local counters collide.
        const pending = packet.event === 'protocol.v2.push' ? undefined : this.pending.get(packet.sequence);
        if (pending) {
            globalThis.clearTimeout(pending.timeoutId);
            this.pending.delete(packet.sequence);
            if (packet.errorCode) pending.reject(new Error(this.errorMessage(packet)));
            else pending.resolve(packet.body);
        }
        // Creator 2.4 NetWork routes failed packets only through OnCodeError and
        // the per-request error callback. Registered success handlers must not run.
        if (!packet.errorCode) {
            for (const listener of this.activityListeners) listener();
            for (const listener of this.listeners.get(packet.event) ?? []) {
                try { listener(packet.body); }
                catch (error) { console.error(`处理 ${packet.event} 事件失败`, error); }
            }
        }
    }

    protected requestSequence(_event: string, _body: unknown): number | null { return null; }

    protected prepareOutboundBody(_event: string, body: unknown): unknown { return body; }

    protected encodeWire(event: string, body: unknown, sequence: number, notify: boolean): string | ArrayBuffer {
        return this.codec.encode({ messageType: notify ? 3 : 2, event, sequence }, body);
    }

    protected decodeWire(data: string | ArrayBuffer): LegacyIncomingPacket {
        if (!(data instanceof ArrayBuffer)) throw new Error('legacy transport requires binary frames');
        const frame = this.codec.decodeFrame(data);
        const assembled = this.assemble(frame);
        if (assembled === null) return { event: '__fragment_pending__', sequence: 0, errorCode: 0, body: {} };
        return this.codec.toPacket(frame, assembled);
    }

    private assemble(frame: LegacyIncomingFrame): string | null {
        if (frame.totalParts === 1) return frame.bodyText;
        const key = `${frame.event}:${frame.sequence}:${frame.errorCode}`;
        let fragmented = this.fragments.get(key);
        if (!fragmented) {
            const timeoutId = globalThis.setTimeout(() => this.fragments.delete(key), 10000);
            fragmented = {
                frame,
                parts: new Array<string | undefined>(frame.totalParts),
                received: 0,
                timeoutId,
            };
            this.fragments.set(key, fragmented);
        } else if (fragmented.parts.length !== frame.totalParts) {
            globalThis.clearTimeout(fragmented.timeoutId);
            this.fragments.delete(key);
            throw new Error(`拆分封包总数不一致：${frame.event}`);
        }
        if (fragmented.parts[frame.partIndex] === undefined) {
            fragmented.parts[frame.partIndex] = frame.bodyText;
            fragmented.received += 1;
        }
        if (fragmented.received !== frame.totalParts) return null;
        globalThis.clearTimeout(fragmented.timeoutId);
        this.fragments.delete(key);
        return fragmented.parts.join('');
    }

    private errorMessage(packet: LegacyIncomingPacket): string {
        const body = packet.body as { Msg?: unknown };
        const detail = typeof body.Msg === 'string' && body.Msg ? body.Msg : `${packet.event} 失败`;
        // Business handlers must be able to branch on stable protocol errors even
        // when a gateway intentionally redacts the internal failure text.
        return `${detail}（${packet.errorCode}）`;
    }

    private nextSequence(): number {
        const value = this.sequence++;
        // The legacy wire header stores sequence as a signed Java short/int16.
        // Never cross 32767 or the decoded response can no longer match pending requests.
        if (this.sequence > 0x7fff) this.sequence = 1;
        return value;
    }

    private rejectAll(error: Error): void {
        for (const pending of this.pending.values()) {
            globalThis.clearTimeout(pending.timeoutId);
            pending.reject(error);
        }
        this.pending.clear();
    }

    private clearFragments(): void {
        for (const packet of this.fragments.values()) globalThis.clearTimeout(packet.timeoutId);
        this.fragments.clear();
    }

    private clearListeners(): void {
        this.listeners.clear();
        this.activityListeners.clear();
        this.reconnectListeners.clear();
        this.closeListeners.clear();
    }
}
