import { resolveRuntimeEndpoints, type RuntimePublicConfig } from '../config/RuntimeEndpoints';
import { API_VERSION, API_VERSION_HEADER, httpGatewayUrl } from '../network/GatewayEntryPolicy';
import { ProtocolHttpClient } from '../network/ProtocolHttpClient';

export interface ProductionApiConfig extends RuntimePublicConfig {}
export type AccessTokenSource = string | (() => string);
export type SessionRefresher = () => Promise<void>;
export type SessionRefreshPolicy = () => boolean;

export class ProductionApiError extends Error {
    public constructor(public readonly code: string, message: string, public readonly status: number,
        public readonly retryable: boolean, public readonly traceId?: string) {
        super(message); this.name = 'ProductionApiError';
    }
}

/** The single authenticated player HTTP boundary; service selection is edge path routing. */
export class ProductionApiClient {
    private readonly inflight = new Map<string, Promise<unknown>>();
    private readonly controllers = new Set<AbortController>();
    private refreshPending: Promise<void> | null = null;
    private disposed = false;

    public constructor(private readonly accessToken: AccessTokenSource, private readonly playerId: string,
        private readonly timeoutMs?: number, private readonly baseUrl?: string,
        private readonly refreshSession?: SessionRefresher,
        private readonly shouldRefreshSession?: SessionRefreshPolicy) {
        if (!this.currentAccessToken()) throw new Error('authenticated access token required');
        if (!/^\d+$/.test(playerId) || playerId === '0') throw new Error('valid player id required');
    }

    public get<T>(path: string, query?: Readonly<Record<string, string | number | undefined>>, _apiHeader = API_VERSION_HEADER): Promise<T> {
        const params = Object.entries(query ?? {}).filter(([, value]) => value !== undefined)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&');
        return this.request<T>('GET', `${path}${params ? `?${params}` : ''}`);
    }

    public mutate<T>(method: 'POST' | 'PUT', path: string, body: unknown, operationKey: string, _apiHeader = API_VERSION_HEADER): Promise<T> {
        const key = `${method}:${path}:${operationKey}`;
        const active = this.inflight.get(key) as Promise<T> | undefined;
        if (active) return active;
        const request = this.request<T>(method, path, body, operationKey).finally(() => this.inflight.delete(key));
        this.inflight.set(key, request);
        return request;
    }

    public destroy(): void { this.disposed = true; this.cancelPending(); }
    public cancelPending(): void { for (const controller of this.controllers) controller.abort(); this.controllers.clear(); this.inflight.clear(); }
    public static operationKey(scope: string): string { return `client:${scope}:${this.uuid()}`.slice(0, 128); }
    private static uuid(): string { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

    private async request<T>(method: string, path: string, body?: unknown, operationKey?: string): Promise<T> {
        if (this.disposed) throw new ProductionApiError('CLIENT_DISPOSED', '页面已关闭', 0, false);
        const config = globalThis.__aoo_RUNTIME_CONFIG__ ?? {};
        const traceId = ProductionApiClient.uuid();
        const timeout = this.integer(this.timeoutMs ?? config.requestTimeoutMs, 8000, 1000, 30000);
        // Generic retries are reserved for read-only requests. Mutations have their own
        // domain idempotency contracts and must never be replayed by this transport.
        const retries = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
            ? this.integer(config.requestMaxRetries, 2, 0, 3)
            : 0;
        let last: ProductionApiError | undefined;
        let refreshed = false;
        if (this.shouldRefreshBeforeRequest()) {
            await this.refreshAccessToken();
            refreshed = true;
        }
        for (let attempt = 0; attempt <= retries; attempt += 1) {
            if (attempt) await new Promise(resolve => globalThis.setTimeout(resolve, Math.min(1000, 150 * 2 ** (attempt - 1))));
            try { return await this.attempt<T>(this.endpoint(path), method, body, operationKey, traceId, timeout); }
            catch (error: unknown) {
                last = error instanceof ProductionApiError ? error
                    : new ProductionApiError('NETWORK_UNAVAILABLE', error instanceof Error ? error.message : '网络不可用', 0, true, traceId);
                if (!refreshed && this.shouldRefresh(last)) {
                    refreshed = true;
                    await this.refreshAccessToken();
                    continue;
                }
                if (!last.retryable || attempt === retries || this.disposed) throw last;
            }
        }
        throw last!;
    }

    private async attempt<T>(endpoint: string, method: string, body: unknown, operationKey: string | undefined,
        traceId: string, timeoutMs: number): Promise<T> {
        const controller = new AbortController(); this.controllers.add(controller);
        const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
        const endpoints = resolveRuntimeEndpoints();
        const accessToken = this.currentAccessToken();
        if (!accessToken) throw new ProductionApiError('SESSION_EXPIRED', '登录会话已失效，请重新登录', 401, false, traceId);
        const headers: Record<string, string> = {
            Authorization: `Bearer ${accessToken}`, [API_VERSION_HEADER]: API_VERSION, 'X-Trace-Id': traceId,
            'X-Player-Id': this.playerId, 'X-Device-Id': endpoints.deviceId,
            'X-Client-Channel': endpoints.clientChannel, 'X-Client-Version': endpoints.clientVersion,
        };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (operationKey) headers['Idempotency-Key'] = operationKey;
        try {
            const response = await ProtocolHttpClient.fetch(endpoint, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
            const raw = await response.text(); let packet: unknown;
            try { packet = raw ? JSON.parse(raw) : null; }
            catch { throw new ProductionApiError('INVALID_RESPONSE', '服务响应格式错误', response.status, response.status >= 500, traceId); }
            if (!response.ok) {
                const record = packet && typeof packet === 'object' ? packet as Record<string, unknown> : {};
                throw new ProductionApiError(String(record.code ?? record.error ?? `HTTP_${response.status}`), String(record.message ?? record.error ?? '请求失败'), response.status,
                    response.status >= 500 || response.status === 408 || response.status === 429, traceId);
            }
            if (packet && typeof packet === 'object' && 'code' in packet) {
                const envelope = packet as { code?: unknown; data?: T; message?: unknown; traceId?: unknown };
                if (envelope.code !== 'OK' && envelope.code !== 0) throw new ProductionApiError(String(envelope.code), String(envelope.message ?? '请求失败'), response.status, false, String(envelope.traceId ?? traceId));
                return envelope.data as T;
            }
            return packet as T;
        } catch (error: unknown) {
            if (error instanceof ProductionApiError) throw error;
            if (controller.signal.aborted) throw new ProductionApiError('REQUEST_TIMEOUT', '网络请求超时，请重试', 0, true, traceId);
            throw new ProductionApiError('NETWORK_UNAVAILABLE', error instanceof Error ? error.message : '网络不可用', 0, true, traceId);
        } finally { globalThis.clearTimeout(timeout); this.controllers.delete(controller); }
    }

    private endpoint(path: string): string {
        const canonical = resolveRuntimeEndpoints().apiBaseUrl;
        if (this.baseUrl && new URL(this.baseUrl, globalThis.location?.href).origin !== new URL(canonical).origin) {
            throw new ProductionApiError('MULTIPLE_BASE_URLS_FORBIDDEN', '生产客户端禁止独立服务地址', 0, false);
        }
        return httpGatewayUrl(path, canonical);
    }
    private currentAccessToken(): string {
        return (typeof this.accessToken === 'function' ? this.accessToken() : this.accessToken).trim();
    }
    private shouldRefresh(error: ProductionApiError): boolean {
        return Boolean(this.refreshSession) && !this.disposed && (error.status === 401 || error.status === 403)
            && /SESSION|TOKEN|expired|bearer/i.test(`${error.code} ${error.message}`);
    }
    private shouldRefreshBeforeRequest(): boolean {
        return Boolean(this.refreshSession) && !this.disposed && Boolean(this.shouldRefreshSession?.());
    }
    private async refreshAccessToken(): Promise<void> {
        if (!this.refreshSession) return;
        if (!this.refreshPending) {
            this.refreshPending = this.refreshSession().finally(() => {
                this.refreshPending = null;
            });
        }
        await this.refreshPending;
    }
    private integer(value: number | undefined, fallback: number, min: number, max: number): number {
        return Number.isInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : fallback;
    }
}
