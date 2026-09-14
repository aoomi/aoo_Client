import { ProtocolClient } from '../../../../Common/Code/Runtime/network/ProtocolClient';

export interface ClubBoxBalance {
    carryCent: number;
    bankCent: number;
}

export interface ClubBoxRecord {
    operateCent: number;
    totalCent?: number;
    time: number;
}

export interface ClubBoxSource {
    balance(): Promise<ClubBoxBalance>;
    records(): Promise<ClubBoxRecord[]>;
    transfer(deltaCent: number): Promise<ClubBoxBalance>;
}

interface BalancePacket {
    result?: number;
    carryCent?: number;
    bankCent?: number;
}

interface RecordPacket {
    result?: number;
    records?: Array<{ operateCent?: number; totalCent?: number; time?: number }>;
}

/** Network boundary for the independently migrated club safe-box feature. */
export class ClubBoxGateway implements ClubBoxSource {
    public constructor(private readonly client: ProtocolClient) {}

    public async balance(): Promise<ClubBoxBalance> {
        return this.toBalance(await this.client.request<BalancePacket>('club.CGetClubRankCent', {}));
    }

    public async records(): Promise<ClubBoxRecord[]> {
        const packet = await this.client.request<RecordPacket>('club.CGetClubRankRecords', {});
        this.requireSuccess(packet.result, '获取保险箱记录失败');
        return (packet.records ?? []).map((record) => ({
            operateCent: this.finite(record.operateCent),
            totalCent: record.totalCent === undefined ? undefined : this.finite(record.totalCent),
            time: this.finite(record.time),
        }));
    }

    public async transfer(deltaCent: number): Promise<ClubBoxBalance> {
        if (!Number.isSafeInteger(deltaCent) || deltaCent === 0) throw new Error('保险箱变更数量无效');
        const packet = await this.client.request<BalancePacket>('club.CModifyClubRankCent', {
            cent: String(deltaCent),
        });
        return this.toBalance(packet);
    }

    private toBalance(packet: BalancePacket): ClubBoxBalance {
        this.requireSuccess(packet.result, '获取保险箱余额失败');
        return {
            carryCent: this.nonNegative(packet.carryCent, '携带积分'),
            bankCent: this.nonNegative(packet.bankCent, '保险箱积分'),
        };
    }

    private requireSuccess(result: number | undefined, message: string): void {
        if (result !== undefined && Number(result) < 0) throw new Error(`${message}：${result}`);
    }

    private nonNegative(value: number | undefined, field: string): number {
        const number = this.finite(value);
        if (number < 0) throw new Error(`${field}不能为负数`);
        return number;
    }

    private finite(value: number | undefined): number {
        const number = Number(value ?? 0);
        if (!Number.isFinite(number)) throw new Error('保险箱响应包含无效数字');
        return number;
    }
}
