import { ClientErrorCorrelation } from './ClientErrorCorrelation';
import { API_VERSION, API_VERSION_HEADER, canonicalApiPath, testPreviewGatewayOrigin } from './GatewayEntryPolicy';

export interface HttpProtocolEnvelope<T> {
    protocolVersion: '2.0';
    msgId: string;
    kind: 'req' | 'resp';
    requestId: string;
    seq: number;
    traceId: string;
    timestamp: number;
    code?: number;
    message?: string;
    body: T;
}

export class ProtocolHttpClient {
    private static readonly RAW_FETCH_TIMEOUT_MS = 15_000;
    public constructor(private readonly timeoutMs = 5000) {}

    /** Sole raw HTTPS transport for adapters whose service envelope is not Protocol V2. */
    public static fetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
        const url = input instanceof URL ? input : new URL(input, globalThis.location?.href);
        ProtocolHttpClient.requireSecureEndpoint(url.toString());
        const abortApi = AbortSignal as typeof AbortSignal & {
            timeout?: (milliseconds: number) => AbortSignal;
            any?: (signals: AbortSignal[]) => AbortSignal;
        };
        const timeoutSignal = abortApi.timeout
            ? abortApi.timeout(ProtocolHttpClient.RAW_FETCH_TIMEOUT_MS)
            : ProtocolHttpClient.fallbackTimeoutSignal(ProtocolHttpClient.RAW_FETCH_TIMEOUT_MS);
        const signal = init.signal
            ? (abortApi.any ? abortApi.any([init.signal, timeoutSignal])
                : ProtocolHttpClient.combineSignals(init.signal, timeoutSignal))
            : timeoutSignal;
        return globalThis.fetch(url, { ...init, signal });
    }

    private static fallbackTimeoutSignal(milliseconds: number): AbortSignal {
        const controller = new AbortController();
        globalThis.setTimeout(() => controller.abort(), milliseconds);
        return controller.signal;
    }

    private static combineSignals(first: AbortSignal, second: AbortSignal): AbortSignal {
        const controller = new AbortController();
        const abort = (): void => controller.abort();
        if (first.aborted || second.aborted) abort();
        else {
            first.addEventListener('abort', abort, { once: true });
            second.addEventListener('abort', abort, { once: true });
        }
        return controller.signal;
    }

    public async post<TRequest, TResponse>(
        endpoint: string,
        msgId: string,
        data: TRequest,
        headers: Readonly<Record<string, string>> = {},
    ): Promise<TResponse> {
        ProtocolHttpClient.requireSecureEndpoint(endpoint);
        const requestId = ProtocolHttpClient.uuid();
        const envelope: HttpProtocolEnvelope<TRequest> = {
            protocolVersion: '2.0', msgId, kind: 'req', requestId, seq: 1, traceId: requestId,
            timestamp: Date.now(), body: data,
        };
        const abortController = new AbortController();
        const timeoutId = globalThis.setTimeout(() => abortController.abort(), this.timeoutMs);
        try {
            const url = new URL(endpoint);
            url.pathname = canonicalApiPath(url.pathname);
            const response = await fetch(url.toString(), {
                method: 'POST', headers: { 'Content-Type': 'application/json', [API_VERSION_HEADER]: API_VERSION, ...headers },
                body: JSON.stringify(envelope), signal: abortController.signal,
            });
            const result = await response.json() as HttpProtocolEnvelope<TResponse>;
            if (!response.ok) {
                const code = typeof result.code === 'number' ? result.code : response.status;
                throw new Error(`${code}: ${result.message ?? `HTTP ${response.status}`}`);
            }
            if (result.protocolVersion !== '2.0' || result.kind !== 'resp' || result.requestId !== requestId) {
                throw new Error('HTTP V2 响应不匹配');
            }
            if ((result.code ?? 0) !== 0) throw new Error(`${result.code}: ${result.message ?? '请求失败'}`);
            return result.body;
        } catch (error: unknown) {
            const roomId = data && typeof data === 'object' && 'roomId' in data
                ? String((data as { roomId?: unknown }).roomId ?? '') : undefined;
            throw ClientErrorCorrelation.enrich(error, { traceId: requestId, requestId, msgId, roomId });
        } finally {
            globalThis.clearTimeout(timeoutId);
        }
    }

    public async getJson<TResponse>(endpoint: string): Promise<TResponse> {
        if (!endpoint.startsWith('https://')) throw new Error('Only HTTPS external requests are allowed');
        const abortController = new AbortController();
        const timeoutId = globalThis.setTimeout(() => abortController.abort(), this.timeoutMs);
        try {
            const response = await fetch(endpoint, { method: 'GET', signal: abortController.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json() as TResponse;
        } finally {
            globalThis.clearTimeout(timeoutId);
        }
    }

    private static uuid(): string {
        return globalThis.crypto?.randomUUID?.()
            ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    private static requireSecureEndpoint(endpoint: string): void {
        const url = new URL(endpoint);
        const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1';
        const config = (globalThis as typeof globalThis & {
            __aoo_RUNTIME_CONFIG__?: { environment?: 'test' | 'production' };
        }).__aoo_RUNTIME_CONFIG__;
        // 仅 Creator 测试预览允许与页面同主机的 8080 HTTP 网关。显式 environment=test
        // 与 Preview URL 必须同时成立，避免普通生产页面通过伪造私网地址绕过 HTTPS。
        const previewRuntime = globalThis as typeof globalThis & { __aoo_CREATOR_LAN_PREVIEW__?: boolean };
        const previewGateway = previewRuntime.__aoo_CREATOR_LAN_PREVIEW__ === true
            ? testPreviewGatewayOrigin(undefined)
            : undefined;
        const trustedPreview = previewGateway !== undefined && new URL(previewGateway).origin === url.origin;
        if (url.protocol !== 'https:' && !(local && url.protocol === 'http:') && !trustedPreview) {
            if (config?.environment === 'test') {
                const runtime = globalThis as typeof globalThis & { __aoo_PREVIEW_VERSION__?: string };
                throw new Error(
                    `Production HTTP endpoints must use HTTPS `
                    + `[Preview diagnostic] href=${globalThis.location?.href ?? 'native'} `
                    + `origin=${globalThis.location?.origin ?? 'native'} environment=test `
                    + `endpoint=${url.origin} preview=${runtime.__aoo_PREVIEW_VERSION__ ?? 'unset'}`,
                );
            }
            throw new Error('Production HTTP endpoints must use HTTPS');
        }
    }
}
