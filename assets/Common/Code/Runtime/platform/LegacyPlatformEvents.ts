import type { LegacyNativeNotification } from './LegacyPlatformBridge';

export type LegacyPlatformEventListener = (data: Record<string, unknown>) => void;

export class LegacyPlatformEvents {
    private readonly listeners = new Map<string, Set<LegacyPlatformEventListener>>();

    public on(type: string, listener: LegacyPlatformEventListener): () => void {
        const group = this.listeners.get(type) ?? new Set<LegacyPlatformEventListener>();
        group.add(listener);
        this.listeners.set(type, group);
        return () => {
            group.delete(listener);
            if (group.size === 0) this.listeners.delete(type);
        };
    }

    public emit(type: string, data: Record<string, unknown> = {}): void {
        for (const listener of this.listeners.get(type) ?? []) listener(data);
    }

    public forward(notification: LegacyNativeNotification): void {
        this.emit(notification.eventType, notification.data);
        const aliases: Record<string, string> = {
            onBatteryLevel: 'EvtBatteryLevel',
            apkProess: 'LoadApkProess',
            RecordAudioFinsh: 'RECORDAUDIOFINSH',
            copyText: 'OnCopyTextNtf',
            getClipboardText: 'OnGetClipboardTextNtf',
            DDShare: 'OnDDShare',
            XLShare: 'OnXLShare',
            OnUploadImageCallBack: 'OnUploadImage',
        };
        const alias = aliases[notification.eventType];
        if (alias) this.emit(alias, notification.data);
    }

    public clear(): void {
        this.listeners.clear();
    }
}

export const legacyPlatformEvents = new LegacyPlatformEvents();
