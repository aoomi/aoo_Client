import { native, sys } from 'cc';
import { legacyPlatformEvents } from './LegacyPlatformEvents';

export type LegacyUpdateState = 'idle' | 'checking' | 'updating' | 'current' | 'failed' | 'restart-required';

export interface LegacyUpdateStatus {
    state: LegacyUpdateState;
    progress: number;
    message?: string;
}

type AssetsManagerLike = {
    setEventCallback(callback: ((event: { getEventCode(): number; getPercent?(): number; getMessage?(): string }) => void) | null): void;
    checkUpdate(): void;
    update(): void;
};

export class LegacyHotUpdateService {
    private manager: AssetsManagerLike | null = null;
    private status: LegacyUpdateStatus = { state: 'idle', progress: 0 };

    public get current(): Readonly<LegacyUpdateStatus> { return this.status; }

    public configure(manifestUrl: string, storagePath = 'aoo-hot-update'): boolean {
        if (!sys.isNative || !manifestUrl) return false;
        const jsb = native as unknown as { AssetsManager?: new (url: string, path: string) => AssetsManagerLike; fileUtils?: { getWritablePath(): string } };
        if (!jsb.AssetsManager || !jsb.fileUtils) return false;
        this.manager = new jsb.AssetsManager(manifestUrl, `${jsb.fileUtils.getWritablePath()}${storagePath}`);
        this.manager.setEventCallback((event) => this.onEvent(event));
        return true;
    }

    public check(): boolean {
        if (!this.manager) return false;
        this.updateStatus('checking', 0);
        this.manager.checkUpdate();
        return true;
    }

    public update(): boolean {
        if (!this.manager) return false;
        this.updateStatus('updating', 0);
        this.manager.update();
        return true;
    }

    public dispose(): void {
        this.manager?.setEventCallback(null);
        this.manager = null;
        this.status = { state: 'idle', progress: 0 };
    }

    private onEvent(event: { getEventCode(): number; getPercent?(): number; getMessage?(): string }): void {
        const code = event.getEventCode();
        const progress = Math.max(0, Math.min(1, event.getPercent?.() ?? this.status.progress));
        const message = event.getMessage?.();
        if (code === 3 || code === 4) this.updateStatus('current', 1, message);
        else if (code === 8) this.updateStatus('restart-required', 1, message);
        else if ([1, 2, 5, 6, 9].includes(code)) this.updateStatus('failed', progress, message);
        else this.updateStatus('updating', progress, message);
    }

    private updateStatus(state: LegacyUpdateState, progress: number, message?: string): void {
        this.status = { state, progress, message };
        legacyPlatformEvents.emit('legacy-hot-update', { ...this.status });
    }
}

export const legacyHotUpdateService = new LegacyHotUpdateService();
