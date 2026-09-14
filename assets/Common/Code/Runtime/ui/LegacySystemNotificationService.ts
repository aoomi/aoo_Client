import { legacyPlatformEvents } from '../platform/LegacyPlatformEvents';

export interface LegacySystemMessagePacket {
    key?: string;
    p?: Array<{ StringValue?: string; IntValue?: number }>;
}

export class LegacySystemNotificationService {
    private messages: Record<string, { Content?: string }> = {};

    public install(messages: Record<string, { Content?: string }>): void { this.messages = messages; }

    public text(messageId: string, parameters: readonly unknown[] = []): string {
        let content = this.messages[messageId]?.Content ?? messageId;
        parameters.forEach((value, index) => {
            content = content.replace(new RegExp(`\\{S${index + 1}\\}`, 'gu'), String(value ?? ''));
        });
        return content;
    }

    public show(messageId: string, parameters: readonly unknown[] = [], position = 4): string {
        const content = this.text(messageId, parameters);
        legacyPlatformEvents.emit('legacy-system-message', { messageId, parameters: [...parameters], position, content });
        return content;
    }

    public accept(packet: LegacySystemMessagePacket): void {
        const messageId = String(packet.key ?? '');
        const parameters = (packet.p ?? []).map((item) => item.StringValue !== undefined ? item.StringValue : item.IntValue ?? 0);
        this.show(messageId, parameters);
        legacyPlatformEvents.emit('ServerSysMsg', { MsgID: messageId, MsgArgList: parameters });
    }
}

export const legacySystemNotificationService = new LegacySystemNotificationService();
