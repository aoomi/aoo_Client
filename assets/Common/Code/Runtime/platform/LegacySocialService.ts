import { sys } from 'cc';
import { legacyPlatformBridge } from './LegacyPlatformBridge';

export type LegacySocialChannel = 'wechat' | 'xl' | 'line' | 'facebook' | 'dd';
export type LegacyShareTarget = 0 | 1;

export interface LegacySharePayload {
    title: string;
    description?: string;
    url?: string;
    imagePath?: string;
    target?: LegacyShareTarget;
}

const LOGIN_METHOD: Record<LegacySocialChannel, string> = {
    wechat: 'OnWeChatLogin', xl: 'OnXLLogin', line: 'OnLineSDKLogin',
    facebook: 'OnFacebookSDKLogin', dd: 'OnDDLogin',
};

export class LegacySocialService {
    public login(channel: LegacySocialChannel): boolean {
        if (!sys.isNative) return false;
        legacyPlatformBridge.callLegacy(LOGIN_METHOD[channel]);
        return true;
    }

    public share(channel: LegacySocialChannel, payload: LegacySharePayload): boolean {
        if (!sys.isNative) {
            if (payload.url) legacyPlatformBridge.writeClipboard(payload.url).catch(() => undefined);
            return false;
        }
        const method = channel === 'wechat' ? 'OnWeChatShare' : channel === 'xl' ? 'OnXLShare' : channel === 'dd' ? 'OnDDShare' : 'OnSystemShare';
        legacyPlatformBridge.callLegacy(method, {
            title: payload.title,
            description: payload.description ?? '',
            url: payload.url ?? '',
            imagePath: payload.imagePath ?? '',
            target: payload.target ?? 0,
        });
        return true;
    }

    public payWechat(order: string): boolean {
        if (!sys.isNative || !order) return false;
        legacyPlatformBridge.callLegacy('OnWeChatPay', { order });
        return true;
    }
}

export const legacySocialService = new LegacySocialService();
