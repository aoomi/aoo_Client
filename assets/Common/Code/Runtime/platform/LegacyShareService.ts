import { legacyPlatformEvents } from './LegacyPlatformEvents';
import { legacySocialService, LegacyShareTarget, LegacySocialChannel } from './LegacySocialService';

export class LegacyShareService {
    public shareImage(channel: LegacySocialChannel, imagePath: string, target: LegacyShareTarget = 1): boolean {
        const result = legacySocialService.share(channel, { title: '', imagePath, target });
        legacyPlatformEvents.emit('legacy-share-requested', { channel, target, imagePath, native: result });
        return result;
    }
}

export const legacyShareService = new LegacyShareService();
