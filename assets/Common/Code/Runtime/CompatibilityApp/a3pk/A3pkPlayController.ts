import { Button, Node } from 'cc';
import { A3pkRuntime } from './A3pkRuntime';

export interface A3pkPlaySelection {
    cards: number[];
    cardType: number;
    substituteCard?: number[];
}

/** Binds the migrated native A3PK buttons to the original server protocols. */
export class A3pkPlayController {
    private readonly disposers: Array<() => void> = [];
    private selection: A3pkPlaySelection = { cards: [], cardType: 0 };
    public constructor(private readonly root: Node, private readonly runtime: A3pkRuntime) {}

    public bind(): void {
        this.bindClick('btn_ready', () => this.send('a3pk.CA3PKReadyRoom', this.roomPacket()));
        this.bindClick('btn_outCard', () => this.outCard());
        this.bindClick('btn_lipai', () => this.send('a3pk.CA3PKLiPai', { ...this.roomPacket(), liPaiList: [this.selection.cards] }));
        this.bindClick('btn_challenge', () => this.challenge(1));
        this.bindClick('btn_refuse', () => this.challenge(2));
        this.bindClick('btn_surrender', () => this.challenge(3));
        this.bindClick('btn_pass', () => this.challenge(0));
        this.bindClick('btn_Exit', () => this.send('a3pk.CA3PKExitRoom', this.roomPacket()));
        this.bindClick('btn_exit_room', () => this.send('a3pk.CA3PKExitRoom', this.roomPacket()));
        this.bindClick('btn_JieSan', () => this.send('a3pk.CA3PKDissolveRoom', this.roomPacket()));
        this.bindClick('btn_tip', () => this.root.emit('A3PK_PromptRequested', this.runtime.getGameLogic()));
        this.bindClick('btn_back', () => { this.selection = { cards: [], cardType: 0 }; this.root.emit('A3PK_SelectionChanged', this.selection); });
    }

    public setSelection(selection: A3pkPlaySelection): void {
        this.selection = { cards: [...selection.cards], cardType: selection.cardType, substituteCard: [...(selection.substituteCard ?? [])] };
    }
    public updateOperation(active: boolean): void {
        for (const name of ['btn_outCard', 'btn_tip', 'btn_pass']) { const node = this.find(name); if (node) node.active = active; }
    }
    public unbind(): void { for (const dispose of this.disposers.splice(0)) dispose(); }

    private roomPacket(): Record<string, number> {
        const room = this.runtime.getRoom() as any;
        const data = room.GetRoomDataInfo?.() ?? {};
        return { roomID: Number(data.roomID ?? data.roomId ?? 0) };
    }
    private setPacket(): Record<string, number> {
        const room = this.runtime.getRoom() as any;
        const data = room.GetRoomDataInfo?.() ?? {};
        const set = this.runtime.getRoomSet() as any;
        const setData = set.GetSetInfo?.() ?? set.GetDataInfo?.() ?? set.dataInfo ?? {};
        return { roomID: Number(data.roomID ?? data.roomId ?? 0), setID: Number(data.setID ?? setData.setID ?? 0), roundID: Number(setData.roundID ?? setData.roundId ?? 0) };
    }
    private async outCard(): Promise<void> {
        if (!this.selection.cards.length) throw new Error('请选择要出的牌');
        await this.send('a3pk.CA3PKOpCard', { ...this.setPacket(), opType: 1, cardType: this.selection.cardType,
            cardList: [...this.selection.cards], substituteCard: [...(this.selection.substituteCard ?? [])] });
    }
    private challenge(opType: number): Promise<void> { return this.send('a3pk.CA3PKChallengeOp', { ...this.roomPacket(), opType }); }
    private async send(event: string, payload: unknown): Promise<void> {
        try { await this.runtime.request(event, payload); }
        catch (error: unknown) { this.root.emit('A3PK_RequestError', error instanceof Error ? error.message : String(error)); }
    }
    private bindClick(name: string, handler: () => void | Promise<void>): void {
        const node = this.find(name); const button = node?.getComponent(Button); if (!node || !button) return;
        const listener = () => { void handler(); }; node.on(Button.EventType.CLICK, listener); this.disposers.push(() => node.off(Button.EventType.CLICK, listener));
    }
    private find(name: string, root: Node = this.root): Node | null {
        if (root.name === name) return root;
        for (const child of root.children) { const result = this.find(name, child); if (result) return result; }
        return null;
    }
}
