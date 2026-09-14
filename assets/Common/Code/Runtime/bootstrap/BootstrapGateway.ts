import { sys } from 'cc';
import { API_VERSION, API_VERSION_HEADER, httpGatewayUrl } from '../network/GatewayEntryPolicy';
import { ProtocolHttpClient } from '../network/ProtocolHttpClient';
import type { RuntimeEndpointConfig } from '../config/RuntimeEndpoints';
import type { BootstrapDecision } from './BootstrapTypes';

export class BootstrapGateway {
    public constructor(private readonly config: RuntimeEndpointConfig) {}

    public async resolve(preferredServerId: number | null): Promise<BootstrapDecision> {
        const controller = new AbortController();
        const timeout = globalThis.setTimeout(() => controller.abort(), 8000);
        try {
            const response = await ProtocolHttpClient.fetch(httpGatewayUrl('/api/v2/version/check', this.config.apiBaseUrl), {
                method: 'POST', signal: controller.signal,
                headers: { 'Content-Type': 'application/json', [API_VERSION_HEADER]: API_VERSION, Authorization: `Bearer ${this.config.bootstrapToken}` },
                body: JSON.stringify({
                    platform: this.platform(), channel: this.config.clientChannel,
                    currentVersion: this.config.clientVersion, resourceVersion: this.config.resourceVersion,
                    deviceId: this.config.deviceId, preferredServerId,
                }),
            });
            const envelope = await response.json() as { code?: string; message?: string; data?: BootstrapDecision };
            if (!response.ok || envelope.code !== 'OK' || !envelope.data) throw new Error(envelope.message ?? `启动服务返回错误 (${response.status})`);
            if (!envelope.data.directory || !Array.isArray(envelope.data.featureFlags)) throw new Error('启动配置响应缺少功能开关或服务器目录');
            return envelope.data;
        } catch (error: unknown) {
            if (error instanceof DOMException && error.name === 'AbortError') throw new Error('启动服务响应超时，请检查网络后点击重试');
            const detail = error instanceof Error ? error.message : '';
            if (/fetch|load failed|network|failed to fetch/i.test(detail)) throw new Error('暂时无法连接启动服务，请检查服务器后点击重试');
            throw error;
        } finally { globalThis.clearTimeout(timeout); }
    }

    private platform(): string {
        if (sys.os === sys.OS.ANDROID) return 'android';
        if (sys.os === sys.OS.IOS) return 'ios';
        return 'web';
    }
}
