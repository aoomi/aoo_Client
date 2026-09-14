import { Button, Node } from 'cc';
import { AycpRuntime } from './AycpRuntime';

/** Native button bridge retaining AYCP's original operation values and payload rules. */
export class AycpPlayController {
    private readonly disposers: Array<() => void> = [];
    public constructor(private readonly root: Node, private readonly runtime: AycpRuntime) {}
    public bind(): void {
        this.bindClick('btn_ready', () => this.send('aycp.CAYCPReadyRoom', this.roomPacket()));
        this.bindClick('btn_cancel', () => this.send('aycp.CAYCPUnReadyRoom', this.roomPacket()));
        this.bindClick('btn_go', () => this.send('aycp.CAYCPStartGame', this.roomPacket()));
        this.bindClick('btn_bupiao', () => this.runtime.getRoomManager().SendPiao(0));
        this.bindClick('btn_piao', () => this.runtime.getRoomManager().SendPiao(1));
        this.bindAction('btn_pass', 0, 8); this.bindAction('btn_peng', 0, 2); this.bindAction('btn_hu', 0, 1);
        this.bindAction('btn_jiepao', 0, 75); this.bindAction('btn_qiangganghu', 0, 9); this.bindAction('btn_baoqidian', 0, 124);
        this.bindAction('btn_notbaoqidian', 0, 125); this.bindAction('btn_tou', -1, 96);
        this.bindClick('btn_chi', () => this.root.emit('AYCP_ChooseOperation', { operation: 'Chi', opType: 6 }));
        this.bindClick('btn_baojiao', () => this.root.emit('AYCP_ChooseOperation', { operation: 'BaoJiao', opType: 99 }));
        this.bindClick('btn_cpass', () => this.root.emit('AYCP_ClientPass'));
        for (const name of ['btn_shezhi', 'btn_wanfa', 'btn_gps', 'btn_chat', 'btn_voice', 'btn_share', 'btn_roomkey']) this.bindClick(name, () => this.root.emit('AYCP_UIAction', name));
    }
    public sendCard(cardId: number): void { this.runtime.getRoomManager().SendPosAction(cardId, 7); }
    public chooseOperation(cardOrCards: number | number[], opType: number): void { this.runtime.getRoomManager().SendPosAction(cardOrCards, opType); }
    public updateOperation(active: boolean): void { const node = this.find('caozuoList'); if (node) node.active = active; }
    public unbind(): void { for (const dispose of this.disposers.splice(0)) dispose(); }
    private roomPacket(): Record<string, number> { const data = (this.runtime.getRoom() as any).GetRoomDataInfo?.() ?? {}; return { roomID: Number(data.roomID ?? data.roomId ?? 0) }; }
    private bindAction(name: string, card: number, opType: number): void { this.bindClick(name, () => this.runtime.getRoomManager().SendPosAction(card, opType)); }
    private async send(event: string, payload: unknown): Promise<void> { try { await this.runtime.request(event, payload); } catch (error: unknown) { this.root.emit('AYCP_RequestError', error instanceof Error ? error.message : String(error)); } }
    private bindClick(name: string, handler: () => void | Promise<void>): void { const node = this.find(name); const button = node?.getComponent(Button); if (!node || !button) return; const listener = () => { void handler(); }; node.on(Button.EventType.CLICK, listener); this.disposers.push(() => node.off(Button.EventType.CLICK, listener)); }
    private find(name: string, root: Node = this.root): Node | null { if (root.name === name) return root; for (const child of root.children) { const result = this.find(name, child); if (result) return result; } return null; }
}
