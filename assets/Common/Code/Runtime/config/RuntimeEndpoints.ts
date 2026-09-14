export interface RuntimeEndpointConfig {
    apiBaseUrl: string;
    accountHttpUrl: string;
    hallWebSocketUrl: string;
    bootstrapToken: string;
    clientVersion: string;
    resourceVersion: string;
    clientChannel: string;
    deviceId: string;
    pageInstanceId: string;
}

import { gatewayOrigin, httpGatewayUrl, testPreviewGatewayOrigin, webSocketGatewayUrl } from '../network/GatewayEntryPolicy';

export interface RuntimePublicConfig {
    /** Editor-owned environment boundary. Production remains HTTPS-only. */
    environment?: 'test' | 'production';
    apiBaseUrl?: string;
    deviceId?: string;
    clientChannel?: string;
    clientVersion?: string;
    resourceVersion?: string;
    /** 玩家头像静态资源目录；本地预览未配置时使用当前主机的 8765 端口。 */
    avatarBaseUrl?: string;
    bootstrapToken?: string;
    requestTimeoutMs?: number;
    requestMaxRetries?: number;
    luckDrawCampaignCode?: string;
    // Deprecated fields remain typed only so stale production injection fails closed.
    accountHttpUrl?: string;
    hallWebSocketUrl?: string;
    serviceHttpUrl?: string;
    luckDrawHttpUrl?: string;
    identityHttpUrl?: string;
    externalPlatformHttpUrl?: string;
    accountV1HttpUrl?: string;
    gatewayHttpUrl?: string;
    officialOrigin?: string;
    gatewayOrigin?: string;
    /** Optional production capability. When true, supportHttpUrl is mandatory. */
    supportEnabled?: boolean;
    supportHttpUrl?: string;
    /** Optional production capability. Disabled unless both fields are configured. */
    giftingEnabled?: boolean;
    giftingHttpUrl?: string;
    giftingUnavailableMessage?: string;
}

declare global {
    var __aoo_RUNTIME_CONFIG__: RuntimePublicConfig | undefined;
}

let runtimeDeviceId: string | undefined;
let pageInstanceId: string | undefined;

/** 页面实例身份只存在于当前 JS context，不能进入 localStorage，否则多窗口会再次被误判为同一页面。 */
export function resolvePageInstanceId(): string {
    if (pageInstanceId) return pageInstanceId;
    pageInstanceId = globalThis.crypto?.randomUUID?.()
        ?? `page-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
    return pageInstanceId;
}

/** One durable device identity shared by account login, HTTP APIs and WSS tickets. */
export function resolveRuntimeDeviceId(): string {
    const configured = globalThis.__aoo_RUNTIME_CONFIG__?.deviceId?.trim();
    if (configured) return runtimeDeviceId = configured;
    if (runtimeDeviceId) return runtimeDeviceId;
    const key = 'aoo.deviceId';
    try {
        const stored = globalThis.localStorage?.getItem(key)?.trim();
        if (stored) return runtimeDeviceId = stored;
    } catch { /* Browser privacy mode can deny storage; keep a process-stable identity. */ }
    runtimeDeviceId = globalThis.crypto?.randomUUID?.()
        ?? `device-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
    try { globalThis.localStorage?.setItem(key, runtimeDeviceId); } catch { /* process cache remains authoritative */ }
    return runtimeDeviceId;
}

export function resolveRuntimeEndpoints(): RuntimeEndpointConfig {
    const config = globalThis.__aoo_RUNTIME_CONFIG__ ?? {};
    // 部分网络客户端会在 LoginScreenBootstrap.start() 之前完成模块初始化。
    // 已知 Creator/本地开发端口可在这一极早阶段安全推导同主机网关；
    // 非预览页面仍拿不到 fallback，并继续执行生产 HTTPS fail-closed。
    const previewGateway = testPreviewGatewayOrigin(undefined);
    const local = config.environment === 'test' || previewGateway !== undefined;
    const raw = config.apiBaseUrl ?? previewGateway ?? '';
    if (!raw) throw new Error('生产环境未配置唯一 HTTPS 服务入口 apiBaseUrl');
    for (const name of ['accountHttpUrl', 'hallWebSocketUrl', 'serviceHttpUrl', 'luckDrawHttpUrl'] as const) {
        if (config[name]) throw new Error(`旧独立服务入口已关闭：${name}`);
    }
    const base = gatewayOrigin(raw).toString();
    const bootstrapToken = config.bootstrapToken ?? (local ? 'local-version-bootstrap-token-32-bytes' : '');
    if (!bootstrapToken) throw new Error('生产环境未配置启动目录鉴权 bootstrapToken');
    return {
        apiBaseUrl: base,
        accountHttpUrl: httpGatewayUrl('/api/v2/account', base),
        hallWebSocketUrl: webSocketGatewayUrl(undefined, base),
        bootstrapToken,
        clientVersion: config.clientVersion ?? '0.1.0',
        resourceVersion: config.resourceVersion ?? config.clientVersion ?? '0.1.0',
        clientChannel: config.clientChannel ?? 'stable',
        deviceId: resolveRuntimeDeviceId(),
        pageInstanceId: resolvePageInstanceId(),
    };
}
