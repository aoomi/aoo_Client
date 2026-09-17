import type { AuthenticatedAccount } from '../../../../Login/Code/Auth/AuthTypes';
import { ProductionApiClient } from '../Activity/ProductionApiClient';

interface ActiveRoomState { active?: boolean; roomId?: number; }

/** Removes the authenticated test account from its authoritative Hall room before a clean login continues. */
export class StuckRoomCleanupService {
    public async cleanup(account: AuthenticatedAccount): Promise<void> {
        const token = String(account.accessToken ?? account.token ?? '').trim();
        const accountId = String(account.accountId ?? '').trim();
        if (!token || !/^[1-9]\d*$/.test(accountId)) throw new Error('清理房间数据需要有效登录会话');
        const api = new ProductionApiClient(token, accountId, 5_000);
        try {
            const active = await api.get<ActiveRoomState>('/api/v2/hall/rooms/active');
            const roomId = Number(active?.roomId ?? 0);
            if (!active?.active || !Number.isSafeInteger(roomId) || roomId <= 0) return;
            await api.mutate('POST', `/api/v2/hall/rooms/${roomId}/leave`, {},
                ProductionApiClient.operationKey(`clear-local-room:${roomId}:${accountId}`));
            const confirmed = await api.get<ActiveRoomState>('/api/v2/hall/rooms/active');
            if (confirmed?.active) throw new Error(`房间 ${Number(confirmed.roomId ?? roomId)} 数据仍未清理`);
        } finally { api.destroy(); }
    }
}
