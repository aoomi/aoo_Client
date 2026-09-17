import { AppError } from '../../../Common/Code/Runtime/core/AppError';
import type { AuthGateway, AuthenticatedAccount } from './AuthTypes';
import { LastAccountStore } from './LastAccountStore';
import { GuestSessionStore } from './GuestSessionStore';

/** Owns account credentials and automatic session restoration. It has no engine lifecycle dependency. */
export class AuthSession {
    private pending = false;
    private restorePending: Promise<AuthenticatedAccount | null> | null = null;
    private currentAccount: AuthenticatedAccount | null = null;
    private sessionEpoch = 0;
    private retryTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    private finishRetryWait: (() => void) | null = null;
    private autoRestoreBlocked = false;
    private restoreFailureMessage = '';
    private started = false;
    private disposed = false;

    public constructor(
        private readonly gateway: AuthGateway,
        private readonly lastAccountStore: LastAccountStore,
        private readonly sessionStore: GuestSessionStore,
        private readonly resumeNetworkSession: () => void = () => undefined,
        private readonly afterExplicitLogin: (account: AuthenticatedAccount) => Promise<void> = async () => undefined,
    ) {}

    public start(): void {
        if (this.disposed) throw new Error('AuthSession has been disposed');
        this.started = true;
    }

    public stop(): void {
        if (!this.started) return;
        this.started = false;
        this.sessionEpoch += 1;
        this.pending = false;
        this.restorePending = null;
        if (this.retryTimer) globalThis.clearTimeout(this.retryTimer);
        this.retryTimer = null;
        this.finishRetryWait?.();
        this.finishRetryWait = null;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.stop();
        this.currentAccount = null;
        this.disposed = true;
    }

    public getLastAccount(): string {
        this.assertStarted();
        return this.autoRestoreBlocked ? '' : this.lastAccountStore.load();
    }

    public acceptExternalSession(account: AuthenticatedAccount): AuthenticatedAccount {
        this.assertStarted();
        this.sessionEpoch += 1;
        this.currentAccount = account;
        this.lastAccountStore.save(account.account);
        this.saveSession(account);
        this.autoRestoreBlocked = false;
        this.restoreFailureMessage = '';
        this.resumeNetworkSession();
        return account;
    }

    public clearSession(): void {
        this.assertStarted();
        this.sessionEpoch += 1;
        this.pending = false;
        this.currentAccount = null;
        this.sessionStore.clear();
        this.restoreFailureMessage = '';
    }

    /** Prevents restoration while the replacement notice is awaiting confirmation. */
    public suspendReplacedSession(): void {
        this.assertStarted();
        this.sessionEpoch += 1;
        this.pending = false;
        this.currentAccount = null;
        this.restorePending = null;
        this.autoRestoreBlocked = true;
    }

    /** Clears only this client's credentials; no logout request is sent to the server. */
    public clearReplacedSession(): void {
        this.assertStarted();
        this.clearSession();
        this.lastAccountStore.clear();
        this.autoRestoreBlocked = false;
    }

    /**
     * Fails closed after the editor-owned full-local-data reset. Stale tokens
     * cannot be restored even when a platform storage deletion throws; a new
     * interactive account or guest login is required to unblock this process.
     */
    public blockAutomaticRestore(): void {
        this.assertStarted();
        this.sessionEpoch += 1;
        this.pending = false;
        this.currentAccount = null;
        this.restorePending = null;
        if (this.retryTimer) globalThis.clearTimeout(this.retryTimer);
        this.retryTimer = null;
        this.finishRetryWait?.();
        this.finishRetryWait = null;
        this.autoRestoreBlocked = true;
        this.restoreFailureMessage = '已清除本地登录数据，请重新登录';
        try { this.sessionStore.clear(); } catch { /* restore remains blocked in memory */ }
        try { this.lastAccountStore.clear(); } catch { /* account hint must not unblock restore */ }
    }

    public loginGateState(): Readonly<{ autoRestoreBlocked: boolean; interactiveLoginAllowed: boolean }> {
        return Object.freeze({
            autoRestoreBlocked: this.autoRestoreBlocked,
            interactiveLoginAllowed: this.started && !this.disposed,
        });
    }

    public logout(clearAccountHint = false): void {
        this.assertStarted();
        const account = this.currentAccount;
        this.clearSession();
        if (account && this.gateway.logout) void this.gateway.logout(account).catch((error) => console.warn('服务端退出登录失败', error));
        if (clearAccountHint) this.lastAccountStore.clear();
    }

    public consumeRestoreFailureMessage(): string {
        this.assertStarted();
        const message = this.restoreFailureMessage;
        this.restoreFailureMessage = '';
        return message;
    }

    public async login(accountInput: string, password: string): Promise<AuthenticatedAccount> {
        this.assertStarted();
        const account = accountInput.trim();
        if (!account) throw new AppError('INVALID_ACCOUNT', '请输入账号');
        if (!password) throw new AppError('INVALID_PASSWORD', '请输入密码');
        if (this.pending) throw new AppError('AUTH_IN_PROGRESS', '正在登录，请稍候');
        this.pending = true;
        const epoch = ++this.sessionEpoch;
        try {
            const authenticated = await this.gateway.loginWithPassword({ account, password });
            if (epoch !== this.sessionEpoch) throw new AppError('AUTH_CANCELLED', '登录已取消');
            await this.afterExplicitLogin(authenticated);
            if (epoch !== this.sessionEpoch) throw new AppError('AUTH_CANCELLED', '登录已取消');
            this.lastAccountStore.save(account);
            this.saveSession(authenticated);
            this.currentAccount = authenticated;
            this.autoRestoreBlocked = false;
            this.restoreFailureMessage = '';
            this.resumeNetworkSession();
            return authenticated;
        } finally { this.pending = false; }
    }

    public requestRegistrationCode(identity: string): Promise<string | null> {
        this.assertStarted();
        return this.gateway.requestRegistrationCode(identity);
    }

    public async register(identityInput: string, password: string, verificationCode: string): Promise<AuthenticatedAccount> {
        this.assertStarted();
        const identity = identityInput.trim();
        if (this.pending) throw new AppError('AUTH_IN_PROGRESS', '正在注册，请稍候');
        this.pending = true;
        const epoch = ++this.sessionEpoch;
        try {
            const authenticated = await this.gateway.registerWithPassword(identity, password, verificationCode);
            if (epoch !== this.sessionEpoch) throw new AppError('AUTH_CANCELLED', '注册已取消');
            await this.afterExplicitLogin(authenticated);
            if (epoch !== this.sessionEpoch) throw new AppError('AUTH_CANCELLED', '注册已取消');
            this.lastAccountStore.save(identity);
            this.saveSession(authenticated);
            this.currentAccount = authenticated;
            this.autoRestoreBlocked = false;
            this.restoreFailureMessage = '';
            this.resumeNetworkSession();
            return authenticated;
        } finally { this.pending = false; }
    }

    public async loginAsGuest(): Promise<AuthenticatedAccount> {
        this.assertStarted();
        if (this.pending) throw new AppError('AUTH_IN_PROGRESS', '正在登录，请稍候');
        this.pending = true;
        const epoch = ++this.sessionEpoch;
        try {
            // A startup reset may block only stale automatic restoration. The
            // explicit guest action always creates a fresh identity instead.
            const cached = this.autoRestoreBlocked ? null : this.sessionStore.load();
            let account: AuthenticatedAccount;
            if (cached) {
                try { account = await this.gateway.loginWithToken(cached.account, cached.refreshToken ?? cached.token, cached.guestCredential); }
                catch (error: unknown) {
                    if (error instanceof AppError && (error.code === 'AUTH_NETWORK_ERROR' || error.code === 'AUTH_TIMEOUT')) throw error;
                    this.sessionStore.clear(); account = await this.gateway.registerGuest();
                }
            } else account = await this.gateway.registerGuest();
            if (epoch !== this.sessionEpoch) throw new AppError('AUTH_CANCELLED', '登录已取消');
            await this.afterExplicitLogin(account);
            if (epoch !== this.sessionEpoch) throw new AppError('AUTH_CANCELLED', '登录已取消');
            this.saveSession(account);
            this.lastAccountStore.save(account.account);
            this.currentAccount = account;
            this.autoRestoreBlocked = false;
            this.restoreFailureMessage = '';
            this.resumeNetworkSession();
            return account;
        } finally { this.pending = false; }
    }

    public restoreSession(): Promise<AuthenticatedAccount | null> {
        this.assertStarted();
        if (this.autoRestoreBlocked) return Promise.resolve(null);
        if (this.currentAccount) return Promise.resolve(this.currentAccount);
        if (this.restorePending) return this.restorePending;
        const restore = this.performRestoreSession(this.sessionEpoch);
        this.restorePending = restore;
        void restore.then(
            () => { if (this.restorePending === restore) this.restorePending = null; },
            () => { if (this.restorePending === restore) this.restorePending = null; },
        );
        return restore;
    }

    private async performRestoreSession(epoch: number): Promise<AuthenticatedAccount | null> {
        const cached = this.sessionStore.load();
        if (!cached) {
            console.info('[AuthRestore] cache=missing');
            return null;
        }
        console.info('[AuthRestore] cache=present', { account: cached.account, hasRefreshToken: Boolean(cached.refreshToken ?? cached.token) });
        for (let attempt = 0; attempt <= 1; attempt += 1) {
            try {
                const account = await this.gateway.loginWithToken(cached.account, cached.refreshToken ?? cached.token, cached.guestCredential);
                if (epoch !== this.sessionEpoch || !this.started) return null;
                this.saveSession(account);
                this.lastAccountStore.save(account.account);
                this.currentAccount = account;
                this.restoreFailureMessage = '';
                console.info('[AuthRestore] result=success', { account: account.account });
                return account;
            } catch (error: unknown) {
                if (error instanceof AppError && (error.code === 'AUTH_NETWORK_ERROR' || error.code === 'AUTH_TIMEOUT') && attempt === 0) {
                    await this.sleep(300);
                    continue;
                }
                const credentialInvalid = error instanceof AppError && error.code === 'INVALID_CREDENTIALS';
                // A timeout/network/server failure says nothing about the stored
                // refresh token. Retain it so an ordinary page refresh cannot
                // silently convert a valid remembered session into logout.
                if (credentialInvalid) this.sessionStore.clear();
                console.warn('[AuthRestore] result=failure', {
                    code: error instanceof AppError ? error.code : 'UNKNOWN',
                    cacheCleared: credentialInvalid,
                });
                this.restoreFailureMessage = error instanceof AppError && error.code === 'INVALID_CREDENTIALS'
                    ? '登录会话已过期，请重新登录'
                    : '本地会话恢复失败，请重新登录';
                return null;
            }
        }
        return null;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            this.finishRetryWait = resolve;
            this.retryTimer = globalThis.setTimeout(() => {
                this.retryTimer = null;
                this.finishRetryWait = null;
                resolve();
            }, ms);
        });
    }

    private saveSession(account: AuthenticatedAccount): void {
        account.onSessionRotated = () => this.saveSession(account);
        this.sessionStore.save({ account: account.account, token: account.refreshToken ?? account.accountToken,
            accessToken: account.accessToken, refreshToken: account.refreshToken,
            accessExpiresAt: account.accessExpiresAt, refreshExpiresAt: account.refreshExpiresAt,
            accountId: account.accountId, guestCredential: account.guestCredential, profile: account.profile });
    }

    private assertStarted(): void {
        if (!this.started || this.disposed) throw new Error('AuthSession is not started');
    }
}
