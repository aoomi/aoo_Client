export type AppErrorCode =
    | 'INVALID_ACCOUNT'
    | 'INVALID_PASSWORD'
    | 'AUTH_IN_PROGRESS'
    | 'AUTH_CANCELLED'
    | 'AUTH_HTTP_ERROR'
    | 'AUTH_INVALID_RESPONSE'
    | 'AUTH_INVALID_ACCOUNT_ID'
    | 'AUTH_TIMEOUT'
    | 'AUTH_NETWORK_ERROR'
    | 'AUTH_CRYPTO_UNAVAILABLE'
    | 'AUTH_SESSION_INVALID'
    | 'AUTH_SESSION_NOT_AUTHORIZED'
    | 'AUTH_TICKET_UNAUTHORIZED'
    | 'AUTH_TICKET_FORBIDDEN'
    | 'INVALID_CREDENTIALS'
    | 'NETWORK_UNAVAILABLE'
    | 'AUTH_REJECTED'
    | 'SERVER_MAINTENANCE'
    | 'ACCOUNT_BANNED'
    | 'ACCOUNT_ALREADY_REGISTERED'
    | 'VERIFICATION_CODE_RATE_LIMITED'
    | 'CLIENT_VERSION_INCOMPATIBLE'
    | `AUTH_SERVER_${number}`
    | 'UNEXPECTED';

export class AppError extends Error {
    public constructor(
        public readonly code: AppErrorCode,
        message: string,
        public readonly cause?: unknown,
    ) {
        super(message);
        this.name = 'AppError';
    }
}
