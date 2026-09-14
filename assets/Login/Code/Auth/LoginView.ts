import { _decorator, Button, Component, EditBox, Label, Node, RichText, Toggle } from 'cc';
import { AppError } from '../../../Common/Code/Runtime/core/AppError';
import type { AuthSession } from './AuthSession';

const { ccclass, property } = _decorator;
const ACCOUNT_MIN_LENGTH = 1;
const ACCOUNT_MAX_LENGTH = 20;
const PASSWORD_MIN_LENGTH = 1;
const PASSWORD_MAX_LENGTH = 64;
const MESSAGE_DRIFT_ALLOWLIST = new Set([
    '账号或密码错误',
    '账号已注册',
    '手机号码位数不够',
    '手机号码位数超过11位',
    '手机号码或邮箱格式错误',
    '验证码已发送',
]);

@ccclass('LoginView')
export class LoginView extends Component {
    private submitting = false;
    private auth: AuthSession | null = null;
    @property(EditBox)
    public accountInput: EditBox | null = null;

    @property(EditBox)
    public passwordInput: EditBox | null = null;

    @property(Button)
    public loginButton: Button | null = null;

    @property(Button)
    public guestLoginButton: Button | null = null;
    public accountDialog: Node | null = null;
    public accountLoginEntryButton: Button | null = null;
    public cancelButton: Button | null = null;
    public loadingIndicator: Node | null = null;
    public errorLabel: Label | null = null;
    public userAgreementToggle: Toggle | null = null;
    public weChatLoginButton: Button | null = null;
    public weChatLogin: (() => Promise<import('./AuthTypes').AuthenticatedAccount>) | null = null;
    public signUpPanel: Node | null = null;
    public signUpIdentityInput: EditBox | null = null;
    public signUpPasswordInput: EditBox | null = null;
    public signUpCodeInput: EditBox | null = null;
    public signUpConfirmButton: Button | null = null;
    public signUpSendCodeButton: Button | null = null;
    public signUpCancelButton: Button | null = null;
    private signUpOpenedFromAccount = false;
    private registrationCodeTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    private registrationCodePending = false;

    public showSystemMessage: ((message: string, modal?: boolean) => void) | null = null;
    public messageDriftRoot: Node | null = null;
    public messageDriftLabel: RichText | null = null;
    public showMessageDrift(message: string): void {
        if (!MESSAGE_DRIFT_ALLOWLIST.has(message)) return;
        this.showSystemMessage?.(message, false);
    }

    public configure(auth: AuthSession): void {
        this.auth = auth;
        this.initializeFromStore();
    }

    public activateBindings(): void {
        this.removeKeyboardHandlers();
        this.installKeyboardHandlers();
    }

    protected override onLoad(): void {
        this.initializeFromStore();
        this.installKeyboardHandlers();
    }

    public initializeFromStore(): void {
        if (this.accountInput && this.auth) this.accountInput.string = this.auth.getLastAccount();
        if (this.passwordInput) this.passwordInput.string = '';
    }

    public openAccountDialog(): void {
        if (this.submitting || !this.accountDialog) return;
        this.clearError();
        this.accountDialog.active = true;
        if (this.accountInput) this.accountInput.enabled = true;
        if (this.passwordInput) this.passwordInput.enabled = true;
        // The scene serializes this panel inactive. Wait until activation has
        // propagated before opening the browser-native EditBox input layer.
        this.scheduleOnce(() => this.accountInput?.focus());
    }

    public closeAccountDialog(): void {
        if (this.submitting || !this.accountDialog) return;
        this.accountDialog.active = false;
        this.accountInput?.blur();
        this.passwordInput?.blur();
        if (this.passwordInput) this.passwordInput.string = '';
        this.clearError();
    }

    public openSignUp(): void {
        if (!this.signUpPanel) return;
        this.signUpOpenedFromAccount = Boolean(this.accountDialog?.active);
        if (this.signUpOpenedFromAccount && this.accountDialog) this.accountDialog.active = false;
        this.signUpPanel.active = true; this.clearError();
    }

    public closeSignUp(): void {
        if (!this.signUpPanel) return;
        this.cancelRegistrationCodeFill();
        this.signUpPanel.active = false;
        this.signUpIdentityInput?.blur();
        this.signUpPasswordInput?.blur();
        this.signUpCodeInput?.blur();
        this.clearError();
        if (this.signUpOpenedFromAccount && this.accountDialog) {
            this.accountDialog.active = true;
            this.accountInput?.focus();
        }
    }

    public async sendRegistrationCode(): Promise<void> {
        if (this.registrationCodePending) return;
        const identity = this.signUpIdentityInput?.string.trim() ?? '';
        const key = this.registrationKey(identity);
        if (!key) return this.showRegistrationValidation(identity);
        this.cancelRegistrationCodeFill();
        this.registrationCodePending = true;
        if (this.signUpSendCodeButton) this.signUpSendCodeButton.interactable = false;
        try {
            const code = await this.requireAuth().requestRegistrationCode(identity);
            if (!this.signUpPanel?.isValid || !this.signUpPanel.activeInHierarchy) return;
            this.showMessageDrift('验证码已发送');
            if (code) {
                this.registrationCodeTimer = globalThis.setTimeout(() => {
                    this.registrationCodeTimer = null;
                    const input = this.signUpCodeInput;
                    if (!input?.node?.isValid || !this.signUpPanel?.isValid || !this.signUpPanel.activeInHierarchy) return;
                    input.inputFlag = EditBox.InputFlag.DEFAULT;
                    input.inputMode = EditBox.InputMode.SINGLE_LINE;
                    input.string = code;
                }, 1000);
            }
        } catch (error: unknown) {
            const message = error instanceof AppError ? this.getFailureMessage(error) : '验证码发送失败，请稍后重试';
            this.showMessageDrift(message);
        } finally {
            this.registrationCodePending = false;
            if (this.signUpSendCodeButton?.node?.isValid) this.signUpSendCodeButton.interactable = true;
        }
    }

    public async confirmSignUp(): Promise<void> {
        if (this.submitting) return;
        const identity = this.signUpIdentityInput?.string.trim() ?? '';
        const code = this.signUpCodeInput?.string.trim() ?? '';
        const password = this.signUpPasswordInput?.string.trim() ?? '';
        const key = this.registrationKey(identity);
        if (!key) return this.showRegistrationValidation(identity);
        if (!password) { this.showMessageDrift('请输入密码'); this.signUpPasswordInput?.focus(); return; }
        if (!code) { this.showMessageDrift('请输入验证码'); this.signUpCodeInput?.focus(); return; }
        this.submitting = true;
        if (this.signUpConfirmButton) this.signUpConfirmButton.interactable = false;
        if (this.signUpSendCodeButton) this.signUpSendCodeButton.interactable = false;
        try {
            const account = await this.requireAuth().register(identity, password, code);
            if (this.signUpPanel) this.signUpPanel.active = false;
            this.node.emit('login-succeeded', account);
        } catch (error: unknown) {
            const message = error instanceof AppError ? this.getFailureMessage(error) : '注册失败，请稍后重试';
            this.showMessageDrift(message);
        } finally {
            this.submitting = false;
            if (this.signUpConfirmButton) this.signUpConfirmButton.interactable = true;
            if (this.signUpSendCodeButton) this.signUpSendCodeButton.interactable = true;
        }
    }

    private registrationKey(identity: string): string | null {
        const normalized = identity.trim().toLowerCase();
        if (/^\d{11}$/.test(normalized)) return `phone:${normalized}`;
        if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return `email:${normalized}`;
        return null;
    }

    private showRegistrationValidation(identity: string): void {
        const value = identity.trim();
        const message = /^\d+$/.test(value)
            ? value.length < 11 ? '手机号码位数不够' : '手机号码位数超过11位'
            : '手机号码或邮箱格式错误';
        this.showMessageDrift(message);
        this.signUpIdentityInput?.focus();
    }

    public async onLoginClicked(): Promise<void> {
        if (this.submitting) return;
        if (!this.hasAcceptedUserAgreement()) return;
        const account = this.accountInput?.string.trim() ?? '';
        if (!account) { this.accountInput?.focus(); return; }
        if (account.length < ACCOUNT_MIN_LENGTH || account.length > ACCOUNT_MAX_LENGTH)
            { this.accountInput?.focus(); return; }
        const password = this.passwordInput?.string.trim() ?? '';
        if (!password) { this.passwordInput?.focus(); return; }
        if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH)
            { this.passwordInput?.focus(); return; }
        this.setBusy(true);
        this.submitting = true;
        try {
            const player = await this.requireAuth().login(
                account,
                password,
            );
            this.node.emit('login-succeeded', player);
        } catch (error: unknown) {
            this.showFailureMessage(error, this.accountInput, '登录失败，请稍后重试');
        } finally {
            this.submitting = false;
            this.setBusy(false);
        }
    }

    public async onGuestLoginClicked(): Promise<void> {
        if (this.submitting) return;
        if (!this.hasAcceptedUserAgreement()) return;
        this.setBusy(true);
        this.submitting = true;
        try {
            const player = await this.requireAuth().loginAsGuest();
            this.node.emit('login-succeeded', player);
        } catch (error: unknown) {
            this.showFailureMessage(error, null, '游客登录失败，请稍后重试');
        } finally {
            this.submitting = false;
            this.setBusy(false);
        }
    }

    public async onWeChatLoginClicked(): Promise<void> {
        if (this.submitting || !this.weChatLogin) return;
        if (!this.hasAcceptedUserAgreement()) return;
        this.setBusy(true); this.submitting = true;
        try { const account=this.requireAuth().acceptExternalSession(await this.weChatLogin());this.node.emit('login-succeeded',account); }
        catch(error:unknown){this.showFailureMessage(error,null,'微信登录失败，请重试');}
        finally{this.submitting=false;this.setBusy(false);}
    }

    protected override onDestroy(): void {
        this.cancelRegistrationCodeFill();
        this.removeKeyboardHandlers();
        this.submitting = false;
        this.showSystemMessage = null;
        if (this.messageDriftRoot?.isValid) this.messageDriftRoot.active = false;
        this.weChatLogin = null;
        this.auth = null;
    }

    private setBusy(busy: boolean): void {
        if (this.loginButton) this.loginButton.interactable = !busy;
        if (this.guestLoginButton) this.guestLoginButton.interactable = !busy;
        if (this.accountLoginEntryButton) this.accountLoginEntryButton.interactable = !busy;
        if (this.cancelButton) this.cancelButton.interactable = !busy;
        if (this.weChatLoginButton) this.weChatLoginButton.interactable = !busy;
        if (this.loadingIndicator) this.loadingIndicator.active = busy;
    }

    private cancelRegistrationCodeFill(): void {
        if (this.registrationCodeTimer) globalThis.clearTimeout(this.registrationCodeTimer);
        this.registrationCodeTimer = null;
    }

    private requireAuth(): AuthSession {
        if (!this.auth) throw new Error('LoginView requires an injected AuthSession');
        return this.auth;
    }

    private hasAcceptedUserAgreement(): boolean {
        if (this.userAgreementToggle?.isChecked) return true;
        this.showInlineError('请先阅读并同意用户使用协议');
        return false;
    }

    private readonly accountReturn = (): void => { this.passwordInput?.focus(); };
    private readonly passwordReturn = (): void => { void this.onLoginClicked(); };

    private installKeyboardHandlers(): void {
        this.accountInput?.node?.on(EditBox.EventType.EDITING_RETURN, this.accountReturn, this);
        this.passwordInput?.node?.on(EditBox.EventType.EDITING_RETURN, this.passwordReturn, this);
    }

    private removeKeyboardHandlers(): void {
        this.accountInput?.node?.off(EditBox.EventType.EDITING_RETURN, this.accountReturn, this);
        this.passwordInput?.node?.off(EditBox.EventType.EDITING_RETURN, this.passwordReturn, this);
    }

    private clearError(): void { if (this.errorLabel) { this.errorLabel.string = ''; this.errorLabel.node.active = false; } }
    private showInlineError(message: string): void {
        if (this.errorLabel && this.errorLabel.node.activeInHierarchy) {
            this.errorLabel.string = message;
            this.errorLabel.node.active = true;
            return;
        }
        this.showMessageDrift(message);
    }

    private showFailureMessage(error: unknown, accountInput: EditBox | null, fallback: string): void {
        if (error instanceof AppError && error.code === 'INVALID_CREDENTIALS' && accountInput) {
            if (this.passwordInput) this.passwordInput.string = '';
            this.showMessageDrift('账号或密码错误');
            return;
        }
        if (error instanceof AppError) {
            const message = this.getFailureMessage(error);
            this.showInlineError(message);
            if (error.code === 'SERVER_MAINTENANCE') this.showSystemMessage?.(message, true);
            return;
        }
        this.showInlineError(fallback);
    }

    private getFailureMessage(error: AppError): string {
        switch (error.code) {
            case 'AUTH_NETWORK_ERROR':
                return '暂时无法连接账号服务，请检查服务器后重试';
            case 'AUTH_TIMEOUT':
                return '账号服务器响应超时，请稍后重试';
            case 'AUTH_HTTP_ERROR':
                if (error.message === 'ACCOUNT_ALREADY_EXISTS') return '账号已注册';
                return '账号服务器返回错误，请稍后重试';
            case 'ACCOUNT_ALREADY_REGISTERED':
                return error.message || '该手机号已注册，请直接登录';
            case 'VERIFICATION_CODE_RATE_LIMITED':
                return error.message || '验证码发送过于频繁，请稍后再试';
            case 'SERVER_MAINTENANCE':
                return '服务器关闭中,请稍后尝试,更多信息敬请关注官方QQ群:483123899。';
            case 'ACCOUNT_BANNED':
                return '账号已被封禁，请联系客服';
            case 'CLIENT_VERSION_INCOMPATIBLE':
                return '当前版本不兼容，请更新客户端';
            case 'AUTH_INVALID_RESPONSE':
                return '登录返回格式异常，请重试';
            case 'AUTH_INVALID_ACCOUNT_ID':
                return '登录结果异常，请重试';
            default:
                return error.message;
        }
    }
}
