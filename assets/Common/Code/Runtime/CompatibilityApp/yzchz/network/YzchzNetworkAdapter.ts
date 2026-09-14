export interface YzchzSocketPort {
    request<T = unknown>(event: string, payload?: unknown): Promise<T>;
}

/** Protocol-only adapter; YZCHZ deliberately reuses the single WordCard table UI. */
export class YzchzNetworkAdapter {
    public constructor(private readonly socket: YzchzSocketPort) {}

    public request<T = unknown>(event: string, payload?: Record<string, unknown>): Promise<T> {
        const source = payload ?? {};
        const action = /GetRoomInfo/i.test(event) ? 'state'
            : /PiaoFen|PiaoHua/i.test(event) ? 'piao'
                : /Ready/i.test(event) ? 'ready'
                    : /StartGame/i.test(event) ? 'start'
                        : /OpCard|PosAction/i.test(event) ? 'operation'
                            : /EnterRoom/i.test(event) ? 'join' : 'state';
        return this.socket.request<T>(event, {
            roomId: source.roomId ?? source.roomID,
            roundNo: source.roundNo ?? 0,
            playVersion: source.playVersion ?? '1.0.0',
            action,
            payload: source,
        });
    }
}
