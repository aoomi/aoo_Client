export interface PasswordLoginCommand {
    account: string;
    password: string;
}

export interface AuthenticatedAccount {
    /** Device identity bound to the current access-token session. */
    deviceId?: string;
    wsTicket?: string;
    refreshWsTicket?: () => Promise<string>;
    /** Cancels a ticket request that belongs to a session being discarded. */
    cancelWsTicketRequest?: () => void;
    /** Decimal wire identifier. Never coerce to number: server IDs may exceed 2^53. */
    accountId: string;
    account: string;
    displayName: string;
    accountToken: string;
    accessToken?: string;
    refreshToken?: string;
    accessExpiresAt?: string | number;
    refreshExpiresAt?: string | number;
    guestCredential?: string;
    profile?: Record<string, unknown>;
    onSessionRotated?: () => void;
    accountType: number;
    openId: string;
    unionId: string;
    token: string;
    nickName: string;
    sex: number;
    headImageUrl: string;
}

export interface AuthGateway {
    requestRegistrationCode(identity: string): Promise<string | null>;
    loginWithPassword(command: PasswordLoginCommand): Promise<AuthenticatedAccount>;
    registerWithPassword(identity: string, password: string, verificationCode: string): Promise<AuthenticatedAccount>;
    registerGuest(): Promise<AuthenticatedAccount>;
    loginWithToken(account: string, token: string, guestCredential?: string): Promise<AuthenticatedAccount>;
    logout?(account: AuthenticatedAccount): Promise<void>;
}
