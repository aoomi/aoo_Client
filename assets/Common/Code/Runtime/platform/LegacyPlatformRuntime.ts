import { legacyPlatformBridge } from './LegacyPlatformBridge';
import { legacyPlatformEvents } from './LegacyPlatformEvents';
import { legacyLocationService } from './LegacyLocationService';
import { legacyVoiceService } from '../CompatibilityApp/platform/LegacyVoiceService';
import { legacySocialService } from './LegacySocialService';
import { legacyHotUpdateService } from './LegacyHotUpdateService';
import { legacyDownloadService } from './LegacyDownloadService';
import { legacyAnalyticsService } from '../CompatibilityApp/platform/LegacyAnalyticsService';
import { legacyRemoteImageService } from './LegacyRemoteImageService';
import { legacyShareService } from './LegacyShareService';
import { legacyChannelIdentityStore } from './LegacyChannelIdentityStore';
import { legacyLocalDataStore } from '../core/LegacyLocalDataStore';
import { legacySystemNotificationService } from '../ui/LegacySystemNotificationService';
import { legacyAudioService } from '../core/LegacyAudioService';
import { legacyChatService } from '../core/LegacyChatService';

export class LegacyPlatformRuntime {
    private disposeBridge: (() => void) | null = null;
    private voiceDisposers: Array<() => void> = [];

    public readonly bridge = legacyPlatformBridge;
    public readonly events = legacyPlatformEvents;
    public readonly location = legacyLocationService;
    public readonly voice = legacyVoiceService;
    public readonly social = legacySocialService;
    public readonly hotUpdate = legacyHotUpdateService;
    public readonly download = legacyDownloadService;
    public readonly analytics = legacyAnalyticsService;
    public readonly images = legacyRemoteImageService;
    public readonly share = legacyShareService;
    public readonly identities = legacyChannelIdentityStore;
    public readonly localData = legacyLocalDataStore;
    public readonly notifications = legacySystemNotificationService;
    public readonly audio = legacyAudioService;
    public readonly chat = legacyChatService;

    public start(): void {
        if (this.disposeBridge) return;
        this.disposeBridge = this.bridge.onNotification((notification) => this.events.forward(notification));
        this.localData.initialize();
        this.location.start();
        const host = globalThis.document ? null : null;
        void host;
        this.voiceDisposers = this.voice.bindLegacyCallbacks();
        this.voiceDisposers.push(this.events.on('download', (data) => this.download.acceptNativeEvent(data)));
    }

    public stop(): void {
        this.disposeBridge?.();
        this.disposeBridge = null;
        this.voiceDisposers.splice(0).forEach((dispose) => dispose());
        this.location.stop();
        this.hotUpdate.dispose();
        this.download.dispose();
        this.images.clear();
        this.events.clear();
    }
}

export const legacyPlatformRuntime = new LegacyPlatformRuntime();

type PlatformGlobals = typeof globalThis & { aooPlatform?: LegacyPlatformRuntime };
(globalThis as PlatformGlobals).aooPlatform = legacyPlatformRuntime;
