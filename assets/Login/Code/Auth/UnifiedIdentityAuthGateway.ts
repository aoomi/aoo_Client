import { AppError } from '../../../Common/Code/Runtime/core/AppError';
import { ProtocolHttpClient } from '../../../Common/Code/Runtime/network/ProtocolHttpClient';
import { gatewayOrigin } from '../../../Common/Code/Runtime/network/GatewayEntryPolicy';
import { resolveRuntimeDeviceId, resolveRuntimeEndpoints } from '../../../Common/Code/Runtime/config/RuntimeEndpoints';
import type { AuthGateway, AuthenticatedAccount, PasswordLoginCommand } from './AuthTypes';

interface JsonRecord { [key: string]: unknown; }
interface TokenPair extends JsonRecord { accessToken: string; refreshToken: string; accessExpiresAt?: string | number; refreshExpiresAt?: string | number; }
interface ApiEnvelope extends JsonRecord { code?: string; message?: string; data?: unknown; }
export interface AccountAuthGatewayOptions { endpoint: string; timeoutMs?: number; }

/** Unified displayId / alias / verified phone / WeChat identity login adapter. */
export class AccountAuthGateway implements AuthGateway {
    private readonly timeoutMs: number;
    private readonly origin: URL;
    private ticketRefreshPending: Promise<string> | null = null;
    private readonly ticketControllers = new Set<AbortController>();
    public constructor(private readonly options: AccountAuthGatewayOptions) {
        this.timeoutMs = options.timeoutMs ?? 5000; this.origin = gatewayOrigin(options.endpoint);
    }
    public async loginWithPassword(command: PasswordLoginCommand): Promise<AuthenticatedAccount> {
        const identity = command.account.trim();
        if (!identity || identity.length > 255) throw new AppError('INVALID_CREDENTIALS', '请输入显示ID、登录别名或已验证手机号');
        const tokens = await this.form<TokenPair>('/api/v2/account/login', { identity, password: command.password, mode: 'multi' });
        return this.assemble(command.account, false, '', tokens);
    }
    public async requestRegistrationCode(identity: string): Promise<string | null> {
        const result = await this.form<JsonRecord>('/api/v2/account/register/code', { identity });
        const code = this.text(result.verificationCode);
        return /^\d{6}$/.test(code) ? code : null;
    }
    public async registerWithPassword(identity: string, password: string, verificationCode: string): Promise<AuthenticatedAccount> {
        await this.form('/api/v2/account/register', {
            login: identity,
            password,
            recovery: `registration:${identity}:${verificationCode}`,
            verificationCode,
        });
        return this.loginWithPassword({ account: identity, password });
    }
    public async registerGuest(): Promise<AuthenticatedAccount> {
        const credential = this.randomSecret();
        await this.form('/api/v2/account/guest/register', { credential });
        const tokens = await this.form<TokenPair>('/api/v2/account/guest/login', { credential, mode: 'multi' });
        return this.assemble(`guest:${credential.slice(0, 12)}`, true, credential, tokens);
    }
    public async loginWithToken(account: string, refreshToken: string, guestCredential = ''): Promise<AuthenticatedAccount> {
        const tokens = guestCredential
            ? await this.form<TokenPair>('/api/v2/account/guest/login', { credential: guestCredential, mode: 'multi' })
            : await this.form<TokenPair>('/api/v2/account/token/refresh', { refreshToken });
        return this.assemble(account, Boolean(guestCredential), guestCredential, tokens);
    }
    public async logout(account: AuthenticatedAccount): Promise<void> {
        await this.request<JsonRecord>('/api/v2/account/logout', 'POST', new URLSearchParams(), this.authHeaders(account.accessToken || account.token));
    }
    private async assemble(account: string, guest: boolean, guestCredential: string, tokens: TokenPair): Promise<AuthenticatedAccount> {
        if (!tokens.accessToken || !tokens.refreshToken) throw new AppError('AUTH_INVALID_RESPONSE', '账号服务器未返回完整会话');
        const headers = this.authHeaders(tokens.accessToken);
        const principal = await this.request<JsonRecord>('/api/v2/account/session', 'GET', undefined, headers);
        const accountId = String(principal.accountId ?? '');
        if (!/^[1-9]\d*$/.test(accountId)) throw new AppError('AUTH_INVALID_ACCOUNT_ID', '账号服务器返回的账号ID无效');
        let profile: JsonRecord = {};
        try { profile = await this.request<JsonRecord>('/api/v2/player-profile/me', 'GET', undefined, headers); } catch { /* optional enrichment */ }
        const displayName = this.text(profile.nickname, profile.displayName, guest ? `游客${accountId}` : account);
        const deviceId = resolveRuntimeDeviceId();
        const result: AuthenticatedAccount = { accountId, account, displayName, deviceId, accountToken: tokens.refreshToken,
            refreshToken: tokens.refreshToken, accessToken: tokens.accessToken, guestCredential, profile,
            accessExpiresAt: this.tokenExpiry(tokens.accessExpiresAt), refreshExpiresAt: this.tokenExpiry(tokens.refreshExpiresAt),
            accountType: guest ? 0 : 1, openId: '', unionId: '', token: tokens.accessToken, nickName: displayName,
            sex: Number(profile.sex ?? 0), headImageUrl: this.text(profile.headImageUrl) };
        // Do not issue a WSS ticket during credential assembly. AuthSession
        // persists this new token first; NetworkRuntime then owns the single
        // authenticated hall-start transition and asks for its ticket there.
        // This keeps a cleared login screen completely network-idle.
        result.refreshWsTicket = () => this.refreshWsTicket(result);
        result.cancelWsTicketRequest = () => this.cancelWsTicketRequests();
        return result;
    }
    private async refreshWsTicket(account: AuthenticatedAccount): Promise<string> {
        if (this.ticketRefreshPending) return this.ticketRefreshPending;
        const refresh = (async () => { try { return await this.issueWsTicket(account); } catch (error) {
            if (!(error instanceof AppError) || error.code !== 'AUTH_TICKET_UNAUTHORIZED' || !account.refreshToken) throw error;
            const rotated = await this.form<TokenPair>('/api/v2/account/token/refresh', { refreshToken: account.refreshToken });
            account.accessToken = account.token = rotated.accessToken; account.refreshToken = account.accountToken = rotated.refreshToken;
            account.accessExpiresAt = this.tokenExpiry(rotated.accessExpiresAt); account.refreshExpiresAt = this.tokenExpiry(rotated.refreshExpiresAt);
            account.onSessionRotated?.();
            return this.issueWsTicket(account);
        } })();
        this.ticketRefreshPending = refresh; try { return await refresh; }
        finally { if (this.ticketRefreshPending === refresh) this.ticketRefreshPending = null; }
    }
    private async issueWsTicket(account: AuthenticatedAccount): Promise<string> {
        const deviceId = account.deviceId?.trim();
        if (!deviceId) throw new AppError('AUTH_SESSION_INVALID', '登录会话缺少设备标识，请重新登录');
        const packet = await this.request<JsonRecord>('/api/v2/gateway/ws_ticket', 'POST', {}, { ...this.authHeaders(account.accessToken || account.token, deviceId),
            // Browsers own the Origin header. Setting it from application code is
            // forbidden and Safari aborts the request before it reaches Gateway.
            'X-Idempotency-Key': `login:${globalThis.crypto?.randomUUID?.() ?? Date.now()}` }, true);
        const data = packet.data && typeof packet.data === 'object' ? packet.data as JsonRecord : packet;
        const ticket = this.text(data.wsTicket); if (!ticket) throw new AppError('AUTH_INVALID_RESPONSE', '网关未返回一次性连接票据'); return ticket;
    }
    private authHeaders(accessToken: string, deviceId?: string): Record<string, string> { return { Authorization: `Bearer ${accessToken}`, ...this.clientHeaders(deviceId) }; }
    private clientHeaders(boundDeviceId?: string): Record<string, string> { const endpoints = resolveRuntimeEndpoints(); return {
        'X-Device-Id': boundDeviceId ?? endpoints.deviceId, 'X-Client-Channel': endpoints.clientChannel, 'X-Client-Version': endpoints.clientVersion,
        'X-Page-Instance-Id': endpoints.pageInstanceId,
    }; }
    private async form<T extends JsonRecord = JsonRecord>(path: string, values: Record<string, string>): Promise<T> { return this.request<T>(path, 'POST', new URLSearchParams(values), {}); }
    private async request<T extends JsonRecord>(path: string, method: string, body: URLSearchParams | object | undefined, headers: Record<string, string>, trackTicket = false): Promise<T> {
        const controller = new AbortController(); const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
        if (trackTicket) this.ticketControllers.add(controller);
        try { const isForm = body instanceof URLSearchParams; const response = await ProtocolHttpClient.fetch(new URL(path.slice(1), this.origin), { method, signal: controller.signal,
            headers: { 'X-Aoo-Api-Version': '1', ...this.clientHeaders(), ...headers,
                ...(body === undefined ? {} : { 'Content-Type': isForm ? 'application/x-www-form-urlencoded;charset=UTF-8' : 'application/json' }) },
            body: body === undefined ? undefined : isForm ? body.toString() : JSON.stringify(body) });
            const packet = await response.json().catch(() => ({})) as ApiEnvelope;
            if (!response.ok) throw this.httpError(response.status, this.text(packet.code, packet.error, packet.message), path);
            if (packet.code && packet.code !== 'OK') throw this.apiError(packet.code, this.text(packet.message));
            const data = packet.code === 'OK' && packet.data && typeof packet.data === 'object' ? packet.data : packet;
            return data as T;
        } catch (error: unknown) { if (error instanceof AppError) throw error;
            if (error instanceof DOMException && error.name === 'AbortError') throw new AppError('AUTH_TIMEOUT', '连接账号服务器超时');
            throw new AppError('AUTH_NETWORK_ERROR', error instanceof Error ? error.message : '无法连接账号服务器');
        } finally { globalThis.clearTimeout(timeout); if (trackTicket) this.ticketControllers.delete(controller); }
    }
    private httpError(status: number, message: string, path: string): AppError {
        if (path === '/api/v2/account/register' && status === 409)
            return new AppError('ACCOUNT_ALREADY_REGISTERED', '该手机号已注册，请直接登录');
        if (path === '/api/v2/account/register/code' && status === 409 && message === 'ACCOUNT_ALREADY_EXISTS')
            return new AppError('ACCOUNT_ALREADY_REGISTERED', '账号已注册');
        if (path === '/api/v2/account/register/code' && status === 429)
            return new AppError('VERIFICATION_CODE_RATE_LIMITED', '验证码发送过于频繁，请稍后再试');
        if (status === 423 || /BANNED|封禁/i.test(message)) return new AppError('ACCOUNT_BANNED', message || '账号已封禁');
        if (status === 426) return new AppError('CLIENT_VERSION_INCOMPATIBLE', message || '客户端版本不兼容');
        // Password validation errors are produced by /account/login.  A ticket
        // error occurs only after credentials have succeeded, so never present
        // it as a password error or retry a forbidden request.
        if (path === '/api/v2/gateway/ws_ticket' && status === 401) return new AppError('AUTH_TICKET_UNAUTHORIZED', message || '登录会话已失效，请重新登录');
        if (path === '/api/v2/gateway/ws_ticket' && status === 403) return new AppError('AUTH_TICKET_FORBIDDEN', message || '登录会话未获连接授权');
        if (status === 401 || status === 403) return new AppError('INVALID_CREDENTIALS', message || '账号或密码错误');
        if (status === 503) return new AppError('SERVER_MAINTENANCE', message || '服务器正在维护中');
        return new AppError('AUTH_HTTP_ERROR', message || `账号服务器返回 HTTP ${status}`);
    }
    private apiError(code: string, message: string): AppError {
        if (/BANNED|SUSPENDED/.test(code)) return new AppError('ACCOUNT_BANNED', message || '账号已封禁');
        if (/VERSION|UPGRADE/.test(code)) return new AppError('CLIENT_VERSION_INCOMPATIBLE', message || '客户端版本不兼容');
        if (/PASSWORD|CREDENTIAL|UNAUTHORIZED|ACCOUNT_NOT_FOUND/.test(code)) return new AppError('INVALID_CREDENTIALS', message || '账号或密码错误');
        return new AppError('AUTH_HTTP_ERROR', message || code);
    }
    private randomSecret(): string {
        const random = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
        if (!random) throw new AppError('AUTH_CRYPTO_UNAVAILABLE', '当前环境不支持安全随机数，无法创建游客账号');
        const bytes = new Uint8Array(32);
        random(bytes);
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    private text(...values: unknown[]): string { return values.find((v): v is string => typeof v === 'string' && v.length > 0) ?? ''; }
    private tokenExpiry(...values: unknown[]): string | number {
        return values.find((value): value is string | number => (typeof value === 'string' && value.length > 0)
            || (typeof value === 'number' && Number.isFinite(value))) ?? '';
    }
    private cancelWsTicketRequests(): void {
        for (const controller of this.ticketControllers) controller.abort();
        this.ticketControllers.clear();
    }
}
