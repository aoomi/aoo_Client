import { native, sys } from 'cc';
import { legacyPlatformBridge } from './LegacyPlatformBridge';
import { legacyPlatformEvents } from './LegacyPlatformEvents';

export enum LegacyDownloadState {
    Finished = 0,
    Error = 1,
    Progress = 2,
}

export interface LegacyDownloadRequest {
    url: string;
    savePath: string;
    fileName?: string;
    type: string;
    retries?: number;
}

interface NativeDownloader {
    setOnFileTaskSuccess(callback: (task: unknown) => void): void;
    setOnTaskError(callback: (task: unknown, errorCode: number, errorCodeInternal: number, errorStr: string) => void): void;
    setOnTaskProgress(callback: (task: unknown, bytesReceived: number, totalBytesReceived: number, totalBytesExpected: number) => void): void;
    createDownloadFileTask(url: string, storagePath: string, identifier?: string): unknown;
}

export class LegacyDownloadService {
    private active: LegacyDownloadRequest | null = null;
    private retryCount = 0;
    private retryTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

    public download(request: LegacyDownloadRequest): boolean {
        if (!request.url || !request.savePath || !request.type) return false;
        this.cancelRetry();
        this.active = { ...request };
        if (!sys.isNative) {
            legacyPlatformEvents.emit(request.type, {
                state: LegacyDownloadState.Error,
                downloadType: request.type,
                reason: 'web-file-download-unsupported',
            });
            return false;
        }
        const NativeDownloader = (native as unknown as { Downloader?: new () => NativeDownloader }).Downloader;
        if (NativeDownloader) {
            const downloader = new NativeDownloader();
            downloader.setOnFileTaskSuccess(() => this.finish());
            downloader.setOnTaskError((_task, code, internal, message) => this.fail(`${code}/${internal}: ${message}`));
            downloader.setOnTaskProgress((_task, received, totalReceived, expected) => {
                const total = expected || totalReceived;
                this.emit(LegacyDownloadState.Progress, total > 0 ? received / total : 0, received, total);
            });
            downloader.createDownloadFileTask(request.url, request.savePath, request.type);
            return true;
        }
        legacyPlatformBridge.callLegacy('downLoadFile', {
            urls: request.url,
            fileName: request.fileName ?? '',
            savePath: request.savePath,
            downloadType: request.type,
        });
        return true;
    }

    public acceptNativeEvent(data: Record<string, unknown>): void {
        const state = Number(data.state);
        if (state === LegacyDownloadState.Finished) this.finish(data);
        else if (state === LegacyDownloadState.Error) this.fail(String(data.error ?? ''), data);
        else if (state === LegacyDownloadState.Progress) {
            this.emit(state, Number(data.proess ?? data.progress) || 0, undefined, undefined, data);
        }
    }

    public dispose(): void {
        this.cancelRetry();
        this.active = null;
    }

    private finish(extra: Record<string, unknown> = {}): void {
        this.emit(LegacyDownloadState.Finished, 1, undefined, undefined, extra);
        this.active = null;
        this.retryCount = 0;
    }

    private fail(reason: string, extra: Record<string, unknown> = {}): void {
        this.emit(LegacyDownloadState.Error, 0, undefined, undefined, { ...extra, reason });
        const request = this.active;
        if (!request || this.retryCount >= (request.retries ?? 1)) return;
        this.retryCount += 1;
        this.retryTimer = globalThis.setTimeout(() => this.download(request), 3000);
    }

    private emit(state: LegacyDownloadState, progress: number, received?: number, total?: number, extra: Record<string, unknown> = {}): void {
        if (!this.active) return;
        legacyPlatformEvents.emit(this.active.type, {
            ...extra,
            state,
            progress,
            proess: progress,
            downloadedBytes: received,
            totalBytes: total,
            downloadType: this.active.type,
        });
    }

    private cancelRetry(): void {
        if (this.retryTimer) globalThis.clearTimeout(this.retryTimer);
        this.retryTimer = null;
    }
}

export const legacyDownloadService = new LegacyDownloadService();
