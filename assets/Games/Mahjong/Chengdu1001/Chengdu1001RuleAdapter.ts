export class Chengdu1001RuleAdapter {
    public readonly code = 'chengdu1001';
    public readonly gameId = 1001;
    public readonly category = 'MAHJONG';
    public readonly region = '成都';
    public readonly displayName = '成都麻将';

    public validateAction(action: string): void {
        if (action === 'chi') throw new Error('[chengdu1001] chi is not supported');
    }

    public validateSnapshot(snapshot: { gameCode?: unknown; gameId?: unknown }): void {
        if (String(snapshot.gameCode).toLowerCase() !== this.code || Number(snapshot.gameId) !== this.gameId) {
            throw new Error('[chengdu1001] authoritative identity mismatch');
        }
    }
}
