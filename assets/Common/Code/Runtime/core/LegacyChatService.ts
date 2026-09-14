import { legacyPlatformEvents } from '../platform/LegacyPlatformEvents';

export interface LegacyChatMessage { pid?: number; quickID?: number; content?: string; url?: string; [key: string]: unknown }

export class LegacyChatService {
    public accept(message: LegacyChatMessage): void {
        legacyPlatformEvents.emit('ChatMessage', { ...message });
    }

    public shouldShowVoice(message: LegacyChatMessage): boolean {
        return typeof message.url === 'string' && message.url.trim().length > 0;
    }

    public quickVoice(quickId: number, sex: number, content = ''): { content: string; soundName: string; animation: string } {
        if (quickId >= 1 && quickId <= 10) return { content, soundName: `${sex}_FastVoice_${quickId}`, animation: '' };
        if (quickId >= 101 && quickId <= 115) return { content, soundName: '', animation: `face${quickId - 100}Action` };
        return { content, soundName: '', animation: '' };
    }
}

export const legacyChatService = new LegacyChatService();
