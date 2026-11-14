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
    | 'IDENTITY_NOT_FOUND'
    | 'CONFIG_NOT_FOUND'
    | 'PROVIDER_MISSING'
    | 'PRICING_POLICY_MISSING'
    | 'SNAPSHOT_MISSING'
    | 'IDENTITY_MISMATCH'
    | 'VERSION_UNSUPPORTED'
    | 'UPSTREAM_UNAVAILABLE'
    | 'INVALID_ENVELOPE'
    | 'PERMISSION_DENIED'
    | 'CLUB_LIST_EMPTY'
    | 'REQUEST_REPLAYED'
    | 'RATE_LIMITED'
    | 'PAYLOAD_TOO_LARGE'
    | 'BACKPRESSURE'
    | 'TICKET_EXPIRED'
    | 'TICKET_REJECTED'
    | 'IDEMPOTENCY_CONFLICT'
    | 'API_VERSION_REQUIRED'
    | 'LEGACY_ENTRY_DISABLED'
    | 'RISK_ADMISSION_REJECTED'
    | 'ROUTE_NOT_FOUND'
    | 'ROUTE_MOVED'
    | 'ROUTE_STALE'
    | 'NODE_DRAINING'
    | 'FENCING_REJECTED'
    | 'ROOM_STATE_CONFLICT'
    | 'ROOM_CAPABILITY_UNSUPPORTED'
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

const NUMERIC_PROTOCOL_CODES: Readonly<Record<number, AppErrorCode>> = Object.freeze({
    1001: 'INVALID_ENVELOPE', 1002: 'PERMISSION_DENIED', 1003: 'REQUEST_REPLAYED',
    1004: 'RATE_LIMITED', 1005: 'PAYLOAD_TOO_LARGE', 1006: 'BACKPRESSURE',
    1007: 'TICKET_EXPIRED', 1008: 'TICKET_REJECTED', 1009: 'IDEMPOTENCY_CONFLICT',
    1010: 'API_VERSION_REQUIRED', 1011: 'LEGACY_ENTRY_DISABLED', 1012: 'RISK_ADMISSION_REJECTED',
    3001: 'ROUTE_NOT_FOUND', 3002: 'ROUTE_MOVED', 3003: 'ROUTE_STALE', 3004: 'NODE_DRAINING',
    3005: 'VERSION_UNSUPPORTED', 3006: 'FENCING_REJECTED', 3007: 'PERMISSION_DENIED',
    3008: 'ROOM_STATE_CONFLICT', 3009: 'ROOM_CAPABILITY_UNSUPPORTED', 3010: 'UPSTREAM_UNAVAILABLE',
});

const SYMBOLIC_PROTOCOL_CODES: Readonly<Record<string, AppErrorCode>> = Object.freeze({
    INVALID_ENVELOPE: 'INVALID_ENVELOPE', HALL_INVALID_REQUEST: 'INVALID_ENVELOPE',
    HALL_INVALID_INTERNAL_REQUEST: 'INVALID_ENVELOPE', HALL_INVALID_ENVELOPE: 'INVALID_ENVELOPE',
    HALL_INVALID_ROOM_ID: 'INVALID_ENVELOPE', HALL_AUTHORITATIVE_FIELD_FORBIDDEN: 'INVALID_ENVELOPE',
    ROOM_AUTHORITY_TYPED_DESTROY_REQUIRED: 'INVALID_ENVELOPE',
    PERMISSION_DENIED: 'PERMISSION_DENIED', HALL_FORBIDDEN: 'PERMISSION_DENIED',
    HALL_UNAUTHORIZED: 'PERMISSION_DENIED', CLUB_PERMISSION_DENIED: 'PERMISSION_DENIED',
    ROOM_ADMIN_FORBIDDEN: 'PERMISSION_DENIED', GATEWAY_UNAUTHORIZED: 'PERMISSION_DENIED',
    HALL_RECORD_ACCESS_DENIED: 'PERMISSION_DENIED', HALL_INTERNAL_FORBIDDEN: 'PERMISSION_DENIED',
    IDENTITY_NOT_FOUND: 'IDENTITY_NOT_FOUND', HALL_NOT_FOUND: 'IDENTITY_NOT_FOUND',
    CONFIG_NOT_FOUND: 'CONFIG_NOT_FOUND', HALL_GAME_UNAVAILABLE: 'CONFIG_NOT_FOUND',
    HALL_RULE_SCHEMA_UNAVAILABLE: 'CONFIG_NOT_FOUND', PROVIDER_MISSING: 'PROVIDER_MISSING',
    HALL_PROVIDER_UNAVAILABLE: 'PROVIDER_MISSING', HALL_GAME_ROUTE_UNAVAILABLE: 'PROVIDER_MISSING',
    PRICING_POLICY_MISSING: 'PRICING_POLICY_MISSING', HALL_COST_POLICY_MISSING: 'PRICING_POLICY_MISSING',
    SNAPSHOT_MISSING: 'SNAPSHOT_MISSING', HALL_ROOM_RULE_SNAPSHOT_UNAVAILABLE: 'SNAPSHOT_MISSING',
    IDENTITY_MISMATCH: 'IDENTITY_MISMATCH', HALL_IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
    VERSION_UNSUPPORTED: 'VERSION_UNSUPPORTED', GATEWAY_VERSION_INCOMPATIBLE: 'VERSION_UNSUPPORTED',
    UPSTREAM_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE', ROOM_AUTHORITY_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE',
    INTERNAL_AUTHORITY_FAILED: 'UPSTREAM_UNAVAILABLE', HALL_INTERNAL_ERROR: 'UPSTREAM_UNAVAILABLE',
    REQUEST_REPLAYED: 'REQUEST_REPLAYED', IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
    CLUB_LIST_EMPTY: 'CLUB_LIST_EMPTY', ROOM_STATE_CONFLICT: 'ROOM_STATE_CONFLICT',
    ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND', HALL_ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
    HALL_INTERNAL_ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND', ROUTE_MOVED: 'ROUTE_MOVED', ROUTE_STALE: 'ROUTE_STALE',
    NODE_DRAINING: 'NODE_DRAINING', FENCING_REJECTED: 'FENCING_REJECTED',
    ROOM_CAPABILITY_UNSUPPORTED: 'ROOM_CAPABILITY_UNSUPPORTED', RATE_LIMITED: 'RATE_LIMITED',
    PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE', BACKPRESSURE: 'BACKPRESSURE',
    TICKET_EXPIRED: 'TICKET_EXPIRED', TICKET_REJECTED: 'TICKET_REJECTED',
    API_VERSION_REQUIRED: 'API_VERSION_REQUIRED', LEGACY_ENTRY_DISABLED: 'LEGACY_ENTRY_DISABLED',
    RISK_ADMISSION_REJECTED: 'RISK_ADMISSION_REJECTED',
});

function classifyProtocolCode(code: unknown, status?: number): AppErrorCode {
    const numeric = typeof code === 'number' ? code : typeof code === 'string' && /^\d+$/.test(code) ? Number(code) : undefined;
    if (numeric !== undefined && NUMERIC_PROTOCOL_CODES[numeric]) return NUMERIC_PROTOCOL_CODES[numeric];
    const symbolic = String(code ?? '').trim().toUpperCase();
    if (SYMBOLIC_PROTOCOL_CODES[symbolic]) return SYMBOLIC_PROTOCOL_CODES[symbolic];
    if (status === 401 || status === 403) return 'PERMISSION_DENIED';
    if (status === 409) return 'ROOM_STATE_CONFLICT';
    if (status === 413) return 'PAYLOAD_TOO_LARGE';
    if (status === 426) return 'VERSION_UNSUPPORTED';
    if (status === 429) return 'RATE_LIMITED';
    if (status !== undefined && status >= 500) return 'UPSTREAM_UNAVAILABLE';
    const text = symbolic;
    if (text.includes('PROVIDER') || text.includes('GAME_ROUTE')) return 'PROVIDER_MISSING';
    if (text.includes('PRIC') || text.includes('COST_POLICY')) return 'PRICING_POLICY_MISSING';
    if (text.includes('SNAPSHOT') || text.includes('RULE_LOCK')) return 'SNAPSHOT_MISSING';
    if (text.includes('IDENTITY') || text.includes('MISMATCH')) return 'IDENTITY_MISMATCH';
    if (text.includes('VERSION') || text.includes('PROTOCOL') || text.includes('UPGRADE')) return 'VERSION_UNSUPPORTED';
    if (text.includes('PERMISSION') || text.includes('FORBIDDEN') || text.includes('UNAUTHORIZED')) return 'PERMISSION_DENIED';
    if (text.includes('AUTHORITY') || text.includes('UPSTREAM') || text.includes('TIMEOUT') || text.includes('NETWORK')) return 'UPSTREAM_UNAVAILABLE';
    if (text.includes('ENVELOPE') || text.includes('RESPONSE MISMATCH') || text.includes('INVALID')) return 'INVALID_ENVELOPE';
    return 'UNEXPECTED';
}

export class AppError extends Error {
    public constructor(
        public readonly code: AppErrorCode,
        message: string,
        public readonly cause?: unknown,
        public readonly legacyCode?: string | number,
        public readonly status?: number,
    ) {
        super(message);
        this.name = 'AppError';
    }

    public static fromProtocol(code: unknown, message = '请求失败', status?: number, cause?: unknown): AppError {
        return new AppError(classifyProtocolCode(code, status), message, cause, typeof code === 'string' || typeof code === 'number' ? code : undefined, status);
    }

    public static fromUnknown(error: unknown, fallback = 'UNEXPECTED'): AppError {
        if (error instanceof AppError) return error;
        const message = error instanceof Error ? error.message : String(error ?? fallback);
        const match = /^(\d+|[A-Za-z][A-Za-z0-9_]*):\s*(.*)$/.exec(message);
        if (match) return AppError.fromProtocol(match[1], match[2] || fallback, undefined, error);
        const code = classifyProtocolCode(message);
        return new AppError(code === 'UNEXPECTED' ? fallback as AppErrorCode : code, message || fallback, error);
    }
}
