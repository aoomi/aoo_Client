import type { CommonPdkRuntime } from './CommonPdkRuntime';

export type CommonPdkVoiceCodec = 'aac' | 'opus' | 'amr';

export interface CommonPdkRecordedVoice {
    readonly bytes: Uint8Array;
    readonly durationMs: number;
    readonly codec: CommonPdkVoiceCodec;
}

/** Media owns binary upload/download. Room realtime only receives the resulting metadata. */
export interface CommonPdkMediaClient {
    recordVoice(): Promise<CommonPdkRecordedVoice | null>;
    stopRecording(): void;
    uploadVoice(voice: CommonPdkRecordedVoice): Promise<{ mediaId: string }>;
    playVoice(mediaId: string, codec: CommonPdkVoiceCodec): Promise<void>;
    cancel(): void;
}

export interface CommonPdkSocialView {
    showQuickText(seatId: number, text: string, durationMs: number): void;
    showEmoji(seatId: number, emojiId: number, durationMs: number): void;
    showVoice(seatId: number, durationMs: number): void;
    hideVoice(seatId: number): void;
    playMagicExpression(sourceSeatId: number, targetSeatId: number, expressionId: number): void;
    clear(): void;
}

export interface CommonPdkSocialMessage {
    readonly messageId?: string;
    readonly requestId?: string;
    readonly serverSeq?: number;
    readonly seatId?: number;
    readonly sourceSeatId?: number;
    readonly senderPid?: number;
    readonly targetSeatId?: number;
    readonly quickId?: number;
    readonly quickID?: number;
    readonly content?: string;
    readonly mediaId?: string;
    readonly assetId?: number;
    readonly durationMs?: number;
    readonly codec?: string;
    readonly mimeType?: string;
    readonly expressionId?: number;
}

interface CommonPdkSocialCapabilities {
    readonly supportsChat: boolean;
    readonly supportsVoice: boolean;
}

const DEFAULT_SOCIAL_CAPABILITIES: CommonPdkSocialCapabilities = Object.freeze({ supportsChat: true, supportsVoice: true });

const QUICK_TEXT: Readonly<Record<number, string>> = {
    1: '大家好，很高兴见到各位！', 2: '快点吧，我等得花儿都谢了！', 3: '不要走，决战到天亮！',
    4: '你的牌打得也太好了！', 5: '和你合作真是太愉快了！', 6: '不好意思，我有事先走了。', 7: '再见了，我会想念大家的！',
};
const EMOJI_QUICK_ID_BASE = 100;

/** Authoritative CommonPdk social flow: single-flight sends, cooldowns, dedupe and teardown. */
export class CommonPdkSocialController {
    private readonly disposers: Array<() => void> = [];
    private readonly seen = new Map<string, number>();
    private readonly cooldowns = new Map<string, number>();
    private voicePending: Promise<void> | null = null;
    private destroyed = false;
    private generation = 0;

    public constructor(
        private readonly runtime: CommonPdkRuntime,
        private readonly media: CommonPdkMediaClient,
        private readonly view: CommonPdkSocialView,
        private readonly showMessage: (message: string) => void,
        private readonly now: () => number = Date.now,
        private readonly capabilities: CommonPdkSocialCapabilities = DEFAULT_SOCIAL_CAPABILITIES,
    ) {
        if (capabilities.supportsChat) this.disposers.push(runtime.on('room.quick_text', (body) => this.receiveQuick(body)));
        if (capabilities.supportsVoice) this.disposers.push(runtime.on('room.voice', (body) => { void this.receiveVoice(body); }));
        this.disposers.push(runtime.on('room.magic_expression', (body) => this.receiveMagic(body)));
    }

    public sendQuickText(quickId: number): Promise<unknown> {
        if (!this.capabilities.supportsChat) return Promise.reject(new Error('当前玩法未启用聊天功能'));
        if (!Number.isInteger(quickId) || !QUICK_TEXT[quickId]) return Promise.reject(new Error('快捷文字无效'));
        this.view.showQuickText(this.clientSeat(), QUICK_TEXT[quickId], 3000);
        return this.sendWithCooldown(`quick:${quickId}`, 800, 'quick-text', {
            command: 'quick_text', roomId: this.roomId(), seatId: this.clientSeat(), quickId,
        });
    }

    public sendChatText(value: string): Promise<unknown> {
        if (!this.capabilities.supportsChat) return Promise.reject(new Error('当前玩法未启用聊天功能'));
        const text = String(value ?? '').trim();
        if (!text) return Promise.reject(new Error('请先输入聊天内容'));
        if (text.length > 80) return Promise.reject(new Error('聊天内容不能超过80个字'));
        this.view.showQuickText(this.clientSeat(), text, 3000);
        return this.sendWithCooldown('chat-text', 800, 'chat-text', {
            command: 'quick_text', roomId: this.roomId(), seatId: this.clientSeat(), quickId: 0, content: text,
        });
    }

    public sendEmoji(emojiId: number): Promise<unknown> {
        if (!this.capabilities.supportsChat) return Promise.reject(new Error('当前玩法未启用聊天功能'));
        if (!Number.isInteger(emojiId) || emojiId < 1 || emojiId > 20) return Promise.reject(new Error('表情无效'));
        this.view.showEmoji(this.clientSeat(), emojiId, 3000);
        return this.sendWithCooldown(`emoji:${emojiId}`, 800, 'emoji', {
            command: 'quick_text', roomId: this.roomId(), seatId: this.clientSeat(),
            quickId: EMOJI_QUICK_ID_BASE + emojiId,
        });
    }

    public sendMagicExpression(targetSeatId: number, expressionId: number): Promise<unknown> {
        if (!Number.isInteger(targetSeatId) || targetSeatId < 0 || targetSeatId === this.clientSeat()) {
            return Promise.reject(new Error('魔法表情目标无效'));
        }
        return this.sendMagicExpressions([targetSeatId], expressionId);
    }

    public sendMagicExpressionToAll(expressionId: number): Promise<unknown> {
        const clientSeat = this.clientSeat();
        const players = this.runtime.getRoomPosManager().GetRoomAllPlayerInfo() as Readonly<Record<string, { pid?: unknown }>>;
        const targets = Object.entries(players)
            .filter(([seat, player]) => Number(seat) !== clientSeat && Number(player?.pid ?? 0) > 0)
            .map(([seat]) => Number(seat))
            .filter((seat) => Number.isInteger(seat) && seat >= 0);
        if (targets.length === 0) return Promise.reject(new Error('当前没有其他玩家'));
        return this.sendMagicExpressions(targets, expressionId);
    }

    private sendMagicExpressions(targets: readonly number[], expressionId: number): Promise<unknown> {
        if (!Number.isInteger(expressionId) || expressionId < 1 || expressionId > 15) {
            return Promise.reject(new Error('魔法表情无效'));
        }
        if (this.destroyed) return Promise.reject(new Error('社交功能已销毁'));
        const now = this.now();
        if ((this.cooldowns.get('magic') ?? 0) > now) return Promise.reject(new Error('操作太频繁，请稍后再试'));
        this.cooldowns.set('magic', now + 1500);
        const sourceSeatId = this.clientSeat();
        const roomId = this.roomId();
        for (const targetSeatId of targets) this.view.playMagicExpression(sourceSeatId, targetSeatId, expressionId);
        return Promise.all(targets.map((targetSeatId) => this.runtime.action('magic-expression', 'common.room.dispatch', {
            command: 'magic_expression', roomId, seatId: sourceSeatId, targetSeatId, expressionId,
        }))).catch((error: unknown) => {
            this.cooldowns.delete('magic');
            throw error;
        });
    }

    public recordAndSendVoice(): Promise<void> {
        if (!this.capabilities.supportsVoice) return Promise.reject(new Error('当前玩法未启用语音功能'));
        if (this.voicePending) return this.voicePending;
        const generation = this.generation;
        const operation = this.recordUploadAndSend(generation).finally(() => {
            if (this.voicePending === operation) this.voicePending = null;
        });
        this.voicePending = operation;
        return operation;
    }

    public cancelVoiceRecording(): void {
        this.media.cancel();
    }

    public finishVoiceRecording(): void {
        this.media.stopRecording();
    }

    public receiveLegacyChat(body: unknown): void {
        const message = this.message(body);
        if (!message || !this.accept(message, 'chat')) return;
        const seatId = this.sourceSeat(message);
        const quickId = Number(message.quickId ?? message.quickID ?? 0);
        this.showChatMessage(seatId, quickId, message.content);
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.generation += 1;
        this.media.cancel();
        for (const dispose of this.disposers.splice(0)) dispose();
        this.seen.clear();
        this.cooldowns.clear();
        this.view.clear();
    }

    private async recordUploadAndSend(generation: number): Promise<void> {
        try {
            const voice = await this.media.recordVoice();
            if (!voice || generation !== this.generation || this.destroyed) return;
            if (!Number.isInteger(voice.durationMs) || voice.durationMs < 1 || voice.durationMs > 60_000 || voice.bytes.length === 0) {
                throw new Error('语音数据无效');
            }
            const uploaded = await this.media.uploadVoice(voice);
            if (generation !== this.generation || this.destroyed) return;
            const mediaId = String(uploaded.mediaId ?? '').trim();
            if (!mediaId || mediaId.length > 160) throw new Error('语音上传结果无效');
            const assetId = Number(mediaId);
            if (!Number.isSafeInteger(assetId) || assetId <= 0) throw new Error('语音上传结果无效');
            await this.runtime.action('voice', 'common.room.dispatch', {
                command: 'voice', roomId: this.roomId(), seatId: this.clientSeat(), assetId,
                durationMs: voice.durationMs, codec: voice.codec,
            });
        } catch (error: unknown) {
            if (generation === this.generation && !this.destroyed) {
                this.showMessage(error instanceof Error ? error.message : '语音发送失败，请重试');
            }
        }
    }

    /** Applies an authoritative quick-text or ordinary-emoji room push. */
    private receiveQuick(body: unknown): void {
        const message = this.message(body);
        const accepted = Boolean(message && this.accept(message, 'quick'));
        if (!message || !accepted) return;
        const seatId = this.sourceSeat(message);
        const quickId = Number(message.quickId ?? message.quickID ?? 0);
        this.showChatMessage(seatId, quickId, message.content);
    }

    private async receiveVoice(body: unknown): Promise<void> {
        const message = this.message(body);
        if (!message || !this.accept(message, 'voice')) return;
        const seatId = this.sourceSeat(message);
        const mediaId = String(message.assetId ?? message.mediaId ?? '').trim();
        const durationMs = Number(message.durationMs ?? 0);
        const mimeType = String(message.mimeType ?? '').toLowerCase();
        const codec = String(message.codec ?? (mimeType === 'audio/aac' ? 'aac' : mimeType === 'audio/amr' ? 'amr' : mimeType === 'audio/ogg' ? 'opus' : '')).toLowerCase();
        // An empty initial-room snapshot must never create a voice bubble.
        if (seatId < 0 || !mediaId || durationMs < 1 || !this.isCodec(codec)) return;
        const shownAt = Date.now();
        this.view.showVoice(seatId, durationMs);
        try { await this.media.playVoice(mediaId, codec); }
        catch (error: unknown) { this.showMessage(error instanceof Error ? error.message : '语音播放失败'); }
        finally {
            // play() may reject or a native adapter may resolve before playback ends. Keep the
            // visible speaker for the authoritative clip duration so users can actually see it.
            const remaining = Math.max(0, Math.max(1_200, durationMs) - (Date.now() - shownAt));
            if (remaining > 0) await new Promise<void>(resolve => globalThis.setTimeout(resolve, remaining));
            if (!this.destroyed) this.view.hideVoice(seatId);
        }
    }

    private receiveMagic(body: unknown): void {
        const message = this.message(body);
        if (!message || !this.accept(message, 'magic')) return;
        const source = this.sourceSeat(message);
        const target = Number(message.targetSeatId ?? -1);
        const expression = Number(message.expressionId ?? 0);
        if (source >= 0 && target >= 0 && expression > 0) this.view.playMagicExpression(source, target, expression);
    }

    private sendWithCooldown(key: string, cooldownMs: number, actionKey: string, body: Record<string, unknown>): Promise<unknown> {
        if (this.destroyed) return Promise.reject(new Error('社交功能已销毁'));
        const now = this.now();
        if ((this.cooldowns.get(key) ?? 0) > now) return Promise.reject(new Error('操作太频繁，请稍后再试'));
        this.cooldowns.set(key, now + cooldownMs);
        return this.runtime.action(actionKey, 'common.room.dispatch', body).catch((error: unknown) => {
            this.cooldowns.delete(key); // failure restores immediate retry
            throw error;
        });
    }

    private accept(message: CommonPdkSocialMessage, kind: string): boolean {
        const now = this.now();
        for (const [key, expiry] of this.seen) if (expiry <= now) this.seen.delete(key);
        const identity = String(message.messageId ?? message.requestId ?? message.serverSeq ?? '').trim();
        if (!identity) return true;
        const key = `${kind}:${identity}`;
        if (this.seen.has(key)) return false;
        this.seen.set(key, now + 120_000);
        return true;
    }

    private message(body: unknown): CommonPdkSocialMessage | null {
        if (!body || typeof body !== 'object') return null;
        const outer = body as { payload?: unknown };
        return (outer.payload && typeof outer.payload === 'object' ? outer.payload : body) as CommonPdkSocialMessage;
    }

    private sourceSeat(message: CommonPdkSocialMessage): number {
        const direct = Number(message.sourceSeatId ?? message.seatId ?? -1);
        if (direct >= 0) return direct;
        const senderPid = Number(message.senderPid ?? 0);
        if (senderPid <= 0) return -1;
        const players = this.runtime.getRoomPosManager().GetRoomAllPlayerInfo() as Readonly<Record<string, { pid?: unknown }>>;
        for (const [seatId, player] of Object.entries(players ?? {})) {
            if (Number(player?.pid ?? 0) === senderPid) return Number(seatId);
        }
        return -1;
    }

    private showChatMessage(seatId: number, quickId: number, content: unknown): void {
        if (seatId < 0) return;
        const emojiId = quickId - EMOJI_QUICK_ID_BASE;
        if (emojiId >= 1 && emojiId <= 20) {
            this.view.showEmoji(seatId, emojiId, 3000);
            return;
        }
        const supplied = String(content ?? '').trim();
        const text = supplied || QUICK_TEXT[quickId] || '';
        if (text) this.view.showQuickText(seatId, text, 3000);
    }

    private clientSeat(): number { return Number(this.runtime.getRoomPosManager().GetClientPos()); }
    private roomId(): number { return Number(this.runtime.getRoomManager().GetEnterRoomID()); }
    private isCodec(value: string): value is CommonPdkVoiceCodec { return value === 'aac' || value === 'opus' || value === 'amr'; }
}
