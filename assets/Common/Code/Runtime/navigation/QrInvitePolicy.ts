export const QrScanResult = Object.freeze({ OK: 'OK', UNREADABLE: 'UNREADABLE', INVALID_SIGNATURE: 'INVALID_SIGNATURE', EXPIRED: 'EXPIRED' });
export interface SignedInvite { payload: string; signature: string }
export class QrInvitePolicy {
    private readonly minimumPixels: number;
    private readonly refreshBeforeExpiryMillis: number;
    constructor() { this.minimumPixels = 256; this.refreshBeforeExpiryMillis = 30_000; }
    presentation(signedInvite: SignedInvite, expiresAtEpochMillis: number, nowEpochMillis: number) {
        if (!signedInvite?.payload || !signedInvite?.signature) throw new Error('signed invite required');
        return { content: JSON.stringify({ v: 1, payload: signedInvite.payload, signature: signedInvite.signature }),
            minimumPixels: this.minimumPixels, screenshotWarning: true,
            refreshAtEpochMillis: Math.max(nowEpochMillis, expiresAtEpochMillis - this.refreshBeforeExpiryMillis) };
    }
    scan(raw: string, verified: boolean, expired: boolean): string {
        if (!raw) return QrScanResult.UNREADABLE;
        if (!verified) return QrScanResult.INVALID_SIGNATURE;
        if (expired) return QrScanResult.EXPIRED;
        return QrScanResult.OK;
    }
}
