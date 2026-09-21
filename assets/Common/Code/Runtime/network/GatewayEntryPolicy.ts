export const API_PREFIX = '/api/v2';
export const API_VERSION_HEADER = 'X-Aoo-Api-Version';
export const API_VERSION = '1';
export const GATEWAY_WS_PATH = `${API_PREFIX}/gateway/ws`;

export interface GatewayEntryConfig {
    gatewayOrigin?: string;
    apiBaseUrl?: string;
    environment?: 'test' | 'production';
}

function isLoopback(hostname: string): boolean {
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
}

function isPrivateIpv4(hostname: string): boolean {
    const parts = hostname.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    return parts[0] === 10
        || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
        || (parts[0] === 192 && parts[1] === 168);
}

/**
 * Creator 手机预览必须把 localhost 网关改写为承载预览页的 Mac 局域网地址。
 * 仅显式 test 环境、HTTP Preview 页面和同一私网主机可以使用明文网关，
 * 因而该便利能力不会削弱 production 的 HTTPS/WSS 边界。
 */
export function testPreviewGatewayOrigin(
    explicit: string | undefined,
    page: Pick<Location, 'protocol' | 'hostname' | 'port'> | undefined = globalThis.location,
): string | undefined {
    const previewPorts = new Set(['7456', '7457', '7458', '7459', '7460', '7461', '5173', '5188']);
    if (!page || page.protocol !== 'http:' || !previewPorts.has(page.port)
        || (!isLoopback(page.hostname) && !isPrivateIpv4(page.hostname))) return explicit;
    if (!explicit) return `http://${page.hostname}:8080/`;
    const url = new URL(explicit);
    if (isLoopback(url.hostname) && !isLoopback(page.hostname)) url.hostname = page.hostname;
    return url.toString();
}

function isTrustedTestGateway(url: URL, config: GatewayEntryConfig): boolean {
    const page = globalThis.location;
    return config.environment === 'test'
        && page?.protocol === 'http:'
        && url.protocol === 'http:'
        && url.hostname === page.hostname
        && (isLoopback(url.hostname) || isPrivateIpv4(url.hostname));
}

export function gatewayOrigin(explicit?: string): URL {
    const config = (globalThis as typeof globalThis & { __aoo_RUNTIME_CONFIG__?: GatewayEntryConfig })
        .__aoo_RUNTIME_CONFIG__ ?? {};
    const injected = config.gatewayOrigin;
    const raw = explicit ?? injected ?? (globalThis as typeof globalThis & { __aoo_RUNTIME_CONFIG__?: GatewayEntryConfig })
        .__aoo_RUNTIME_CONFIG__?.apiBaseUrl;
    if (!raw) throw new Error('唯一生产网关 gatewayOrigin 未配置');
    const url = new URL(raw, globalThis.location?.href);
    const loopback = isLoopback(url.hostname);
    if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:') && !isTrustedTestGateway(url, config)) {
        throw new Error('生产网关必须使用 HTTPS');
    }
    if (url.username || url.password || (url.pathname !== '/' && url.pathname !== '')) {
        throw new Error('gatewayOrigin 只能包含 scheme、host 和 port');
    }
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url;
}

export function canonicalApiPath(path: string): string {
    const raw = path.split('?')[0];
    const suffix = path.slice(raw.length);
    if (raw !== API_PREFIX && !raw.startsWith(`${API_PREFIX}/`)) throw new Error(`旧版或非版本化 API 路径已拒绝：${raw}`);
    const canonical = raw;
    if (canonical.includes('//') || canonical.includes('..')) throw new Error('API 路径必须规范化');
    return canonical + suffix;
}

export function httpGatewayUrl(path: string, explicitOrigin?: string): string {
    return new URL(canonicalApiPath(path).slice(1), gatewayOrigin(explicitOrigin)).toString();
}

export function webSocketGatewayUrl(ticket?: string, explicitOrigin?: string): string {
    const url = gatewayOrigin(explicitOrigin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = GATEWAY_WS_PATH;
    if (ticket) url.searchParams.set('ticket', ticket);
    return url.toString();
}

export function requireCanonicalWebSocketUrl(raw: string): string {
    const url = new URL(raw);
    const loopback = isLoopback(url.hostname);
    const config = (globalThis as typeof globalThis & { __aoo_RUNTIME_CONFIG__?: GatewayEntryConfig })
        .__aoo_RUNTIME_CONFIG__ ?? {};
    const trustedTestSocket = config.environment === 'test'
        && globalThis.location?.protocol === 'http:'
        && url.protocol === 'ws:'
        && url.hostname === globalThis.location.hostname
        && (loopback || isPrivateIpv4(url.hostname));
    if (url.protocol !== 'wss:' && !(loopback && url.protocol === 'ws:') && !trustedTestSocket) {
        throw new Error('生产网关必须使用 WSS');
    }
    if (url.pathname !== GATEWAY_WS_PATH || url.username || url.password) throw new Error('旧 WebSocket 入口已关闭');
    // Creator's loose web build does not preserve iterator spread correctly;
    // it can produce `[URLSearchParams Iterator]` and reject a clean URL.
    const keys = Array.from(url.searchParams.keys());
    if (keys.some(key => key !== 'ticket') || keys.filter(key => key === 'ticket').length > 1) {
        throw new Error(`WebSocket URL 含未授权或重复参数：${keys.join(',') || '无'}`);
    }
    if (url.hash) throw new Error('WebSocket URL 不得含 fragment');
    return url.toString();
}
