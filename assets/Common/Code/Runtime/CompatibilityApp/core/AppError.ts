export type AppErrorCode =
    | 'INVALID_ACCOUNT'
    | 'INVALID_PASSWORD'
    | 'AUTH_IN_PROGRESS'
    | 'AUTH_HTTP_ERROR'
    | 'AUTH_INVALID_RESPONSE'
    | 'AUTH_INVALID_ACCOUNT_ID'
    | 'AUTH_TIMEOUT'
    | 'AUTH_NETWORK_ERROR'
    | 'INVALID_CREDENTIALS'
    | 'NETWORK_UNAVAILABLE'
    | 'AUTH_REJECTED'
    | 'SERVER_MAINTENANCE'
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
