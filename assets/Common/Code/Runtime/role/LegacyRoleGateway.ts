import type { AuthenticatedAccount } from '../../../../Login/Code/Auth/AuthTypes';
import { ProtocolClient } from '../network/ProtocolClient';
import type { RoleSession } from './RoleTypes';
import { bootstrapRuntime } from '../bootstrap/BootstrapRuntime';
import { resolveRuntimeEndpoints } from '../config/RuntimeEndpoints';

interface BaseLoginPacket { isNeedCreateRole?: boolean; }

export class LegacyRoleGateway {
    private readonly serverId: number;
    private readonly clientVersion: string;
    public constructor(private readonly client: ProtocolClient, private readonly endpoint: string, serverId?: number, clientVersion?: string, private readonly isSessionActive: () => boolean = () => true) {
        const selected = bootstrapRuntime.selectedServer();
        this.serverId = serverId ?? selected?.id ?? (() => { throw new Error('权威区服目录尚未选择服务器'); })();
        this.clientVersion = clientVersion ?? resolveRuntimeEndpoints().clientVersion;
    }

    public async login(account: AuthenticatedAccount): Promise<RoleSession> {
        this.requireActive();
        // Gateway tickets are single-use. A stored ticket may already have been
        // consumed by the game connection, so every reconnect/login transition
        // must prefer a freshly issued ticket when the account can rotate one.
        const ticket = account.refreshWsTicket
            ? await account.refreshWsTicket()
            : account.wsTicket ?? '';
        this.requireActive();
        this.client.setWsTicket(ticket);
        await this.client.connect(this.endpoint);
        this.requireActive();
        const baseLogin = await this.client.request<BaseLoginPacket>('base.C1004Login', {
            accountID: account.accountId,
            openid: account.openId,
            unionid: account.unionId,
            token: account.token,
            nickName: account.nickName,
            sex: account.sex,
            headImageUrl: account.headImageUrl,
            isMobile: 0,
            serverID: this.serverId,
            version: this.clientVersion,
        });
        const packet = baseLogin.isNeedCreateRole
            ? await this.client.request<Record<string, unknown>>('base.C1001CreateRole', {
                nickName: account.nickName,
                sex: account.sex,
                headImageUrl: account.headImageUrl,
                accountID: account.accountId,
                isMobile: 0,
                Phone: 0,
            })
            : await this.client.request<Record<string, unknown>>('base.C1006RoleLogin', { accountID: account.accountId });
        const session = this.toRoleSession(packet, account);
        return session;
    }

    public async resumeWithToken(
        account: AuthenticatedAccount,
        token: unknown,
        gameName: string,
    ): Promise<RoleSession> {
        const ticket = String(token ?? '').trim();
        if (!ticket) throw new Error(`切换到 ${gameName} 服的一次性票据无效`);
        this.client.setWsTicket(ticket);
        await this.client.connect(this.endpoint);
        const playerId = Number(account.accountId);
        if (!Number.isSafeInteger(playerId) || playerId <= 0) throw new Error(`切换到 ${gameName} 服的账号标识无效`);
        return { playerId, displayName: account.displayName, headImageUrl: account.headImageUrl,
            roomCard: 0, diamond: 0, raw: { accountID: account.accountId, transportAuthenticated: true } };
    }

    private toRoleSession(packet: Record<string, unknown>, account: AuthenticatedAccount): RoleSession {
        const playerId = Number(packet.pid);
        if (!Number.isSafeInteger(playerId) || playerId <= 0) throw new Error('大厅服务器未返回有效玩家ID');
        const diamond = this.numberValue(packet.diamond, packet.diamondCount, packet.crystal);
        const legacyRoomCard = this.numberValue(packet.roomCard, packet.roomCardCount, packet.gold);
        return {
            playerId,
            displayName: this.stringValue(packet.name, packet.nickName, account.displayName),
            headImageUrl: this.stringValue(packet.headImageUrl, account.headImageUrl),
            roomCard: diamond > 0 ? diamond : legacyRoomCard,
            diamond,
            raw: packet,
        };
    }

    private stringValue(...values: unknown[]): string {
        return values.find((value): value is string => typeof value === 'string' && value.length > 0) ?? '';
    }

    private numberValue(...values: unknown[]): number {
        const value = values.find((candidate) => Number.isFinite(Number(candidate)));
        return value === undefined ? 0 : Number(value);
    }

    private errorText(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
    private requireActive(): void {
        if (this.isSessionActive()) return;
        this.client.close();
        throw new Error('登录会话已取消');
    }
}
