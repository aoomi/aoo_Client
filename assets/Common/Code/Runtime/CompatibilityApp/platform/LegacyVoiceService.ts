import { sys } from 'cc';
import { legacyPlatformBridge } from './LegacyPlatformBridge';
import { legacyPlatformEvents } from './LegacyPlatformEvents';

export class LegacyVoiceService {
    private recording = false;

    public get supported(): boolean { return sys.isNative; }
    public get isRecording(): boolean { return this.recording; }

    public prepare(): boolean {
        if (!this.supported) return false;
        legacyPlatformBridge.callLegacy('prepareAudio');
        return true;
    }

    public startRecord(fileName = ''): boolean {
        if (!this.supported || this.recording) return false;
        this.recording = true;
        legacyPlatformBridge.callLegacy('startRecord', fileName ? { fileName } : {});
        return true;
    }

    public stopRecord(): boolean {
        if (!this.supported || !this.recording) return false;
        this.recording = false;
        legacyPlatformBridge.callLegacy('stopRecord');
        return true;
    }

    public play(filePath: string): boolean {
        if (!this.supported || !filePath) return false;
        legacyPlatformBridge.callLegacy('playAudio', { filePath });
        return true;
    }

    public stopPlay(): boolean {
        if (!this.supported) return false;
        legacyPlatformBridge.callLegacy('stopAudio');
        return true;
    }

    public bindLegacyCallbacks(): Array<() => void> {
        return ['AudioError', 'AudioStopError', 'MedioRecordError', 'wellPrepared', 'RecordAudioFinsh', 'palyAudioFinsh']
            .map((type) => legacyPlatformEvents.on(type, () => {
                if (type === 'RecordAudioFinsh' || type.includes('Error')) this.recording = false;
            }));
    }
}

export const legacyVoiceService = new LegacyVoiceService();
