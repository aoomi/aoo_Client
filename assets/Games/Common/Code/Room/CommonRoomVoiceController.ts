import type { CommonRoomSocialController } from './CommonRoomSocialController';

export interface CommonRoomVoiceCapture {
    readonly identity: string;
    readonly payload?: unknown;
}

export interface CommonRoomVoiceCapturePort {
    capture(): Promise<CommonRoomVoiceCapture | null>;
    finish(): void;
    cancel(): void;
    destroy(): void;
}

export interface CommonRoomVoiceWindowPort {
    open(): void;
    close(): void;
    destroy(): void;
}

/** Owns one recording operation and window. Media and wire formats stay in adapters. */
export class CommonRoomVoiceController {
    private pending: Promise<void> | null = null;
    private generation = 0;
    private destroyed = false;

    public constructor(
        private readonly social: CommonRoomSocialController,
        private readonly capture: CommonRoomVoiceCapturePort,
        private readonly window: CommonRoomVoiceWindowPort,
    ) {}

    public start(): Promise<void> {
        this.assertAlive();
        if (this.pending) return this.pending;
        const generation = this.generation;
        this.window.open();
        const operation = this.record(generation).finally(() => {
            if (this.pending === operation) this.pending = null;
            if (generation === this.generation) this.window.close();
        });
        this.pending = operation;
        return operation;
    }

    public finish(): void {
        if (!this.destroyed && this.pending) this.capture.finish();
    }

    public cancel(): void {
        if (this.destroyed) return;
        this.generation += 1;
        this.capture.cancel();
        this.pending = null;
        this.window.close();
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.generation += 1;
        this.capture.cancel();
        this.capture.destroy();
        this.window.destroy();
        this.pending = null;
    }

    private async record(generation: number): Promise<void> {
        const result = await this.capture.capture();
        if (!result || generation !== this.generation || this.destroyed) return;
        const identity = result.identity.trim();
        if (!identity) throw new Error('COMMON_ROOM_VOICE_IDENTITY_REQUIRED');
        await this.social.send('voice', { identity, payload: result.payload }, `voice:${identity}`);
    }

    private assertAlive(): void {
        if (this.destroyed) throw new Error('COMMON_ROOM_VOICE_DESTROYED');
    }
}
