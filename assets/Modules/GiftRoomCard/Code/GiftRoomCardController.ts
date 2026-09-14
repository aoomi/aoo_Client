import { Button, instantiate, Label, Node } from 'cc';
import { GiftingClient, type GiftLedgerEntry } from '../../../Common/Code/Runtime/Gifting/GiftingClient';
import type { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { type NumpadHandle, NumpadService } from '../../../Common/Code/Runtime/ui/NumpadService';

const FORM = 'UILobbyGift';
const GIFT = 'Content/GiftForm';
const HISTORY = 'Content/History/HistoryList/View/Content';

/** Aoo 赠送房卡业务入口；只依赖正式赠送 API 和公共数字键盘。 */
export class GiftRoomCardController {
    private readonly numpad = new NumpadService();
    private readonly disposers: Array<() => void> = [];
    private keyboard: NumpadHandle | null = null;
    private recipient = '';
    private quantity = '';
    private sending = false;
    private generation = 0;
    private inboxCursor = 0;

    public constructor(
        private readonly forms: LegacyFormManager,
        private readonly eventNode: Node,
        private readonly api: GiftingClient,
        private readonly playerId: number,
        private readonly reportError: (error: unknown) => void,
    ) {}

    public install(): void { void this.watchInbox(++this.generation); }

    public async open(): Promise<void> {
        const generation = this.generation;
        try {
            const form = await this.forms.show(FORM);
            if (!form || !this.active(generation)) return;
            this.bind(form);
            await this.refresh(form, generation);
        } catch (error: unknown) { this.reportError(error); }
    }

    public destroy(): void {
        this.generation += 1;
        this.api.destroy();
        this.clearBindings();
    }

    private bind(form: LegacyForm): void {
        this.clearBindings();
        this.recipient = '';
        this.quantity = '';
        this.writeInput(form, 'RecipientId/Btn_RecipientId/Label', '');
        this.writeInput(form, 'Quantity/Btn_Quantity/Label', '');
        this.click(form.find(`${GIFT}/RecipientId/Btn_RecipientId`), () => { void this.openKeyboard(form, 'recipient'); });
        this.click(form.find(`${GIFT}/Quantity/Btn_Quantity`), () => { void this.openKeyboard(form, 'quantity'); });
        this.click(form.find(`${GIFT}/Btn_Confirm`), () => { void this.send(form); });
        this.click(form.find('Popup/Tag/Btn_Close'), () => this.forms.closeAfterPointer(FORM));
    }

    private async openKeyboard(form: LegacyForm, field: 'recipient' | 'quantity'): Promise<void> {
        this.keyboard?.dispose();
        const maxDigits = field === 'recipient' ? 12 : 8;
        const value = (): string => field === 'recipient' ? this.recipient : this.quantity;
        const assign = (next: string): void => {
            if (field === 'recipient') this.recipient = next;
            else this.quantity = next;
            this.writeInput(form, field === 'recipient'
                ? 'RecipientId/Btn_RecipientId/Label'
                : 'Quantity/Btn_Quantity/Label', next);
        };
        const close = (): void => { this.keyboard?.dispose(); this.keyboard = null; };
        this.keyboard = await this.numpad.open(form.node, () => this.forms.loadCommonNumpad(), {
            close,
            confirm: () => { if (field === 'recipient') this.showRecipient(form); close(); },
        }, { digitCount: maxDigits, maxDigits, value, setValue: assign }, {
            title: field === 'recipient' ? '请输入玩家 ID' : '请输入赠送数量',
        });
    }

    private async send(form: LegacyForm): Promise<void> {
        if (this.sending) return;
        const recipient = Number.parseInt(this.recipient, 10);
        const quantity = Number.parseInt(this.quantity, 10);
        if (!Number.isSafeInteger(recipient) || recipient <= 0) return this.reportError(new Error('请输入有效的玩家 ID'));
        if (!Number.isSafeInteger(quantity) || quantity <= 0) return this.reportError(new Error('请输入有效的赠送数量'));
        this.sending = true;
        this.enableConfirm(form, false);
        try {
            const key = `client:gift:${Date.now()}:${recipient}:${quantity}`.slice(0, 128);
            const receipt = await this.api.send(recipient, 'ROOM_CARD', quantity, key);
            this.eventNode.emit('legacy-gifting-sent', receipt);
            this.setLabel(form.node, `${GIFT}/Recipient/Head/Lb_Name`, `赠送成功：${receipt.quantity} 张房卡`);
            this.recipient = '';
            this.quantity = '';
            this.writeInput(form, 'RecipientId/Btn_RecipientId/Label', '');
            this.writeInput(form, 'Quantity/Btn_Quantity/Label', '');
            await this.refresh(form, this.generation);
        } catch (error: unknown) {
            this.eventNode.emit('legacy-gifting-error', error);
            this.reportError(error);
        } finally {
            this.sending = false;
            this.enableConfirm(this.forms.get(FORM) ?? null, true);
        }
    }

    private async refresh(form: LegacyForm, generation: number): Promise<void> {
        try {
            const entries = await this.api.ledger();
            if (!this.active(generation) || !form.isShown()) return;
            this.advance(entries);
            this.renderHistory(form, entries);
            this.eventNode.emit('legacy-gifting-loaded', entries);
        } catch (error: unknown) {
            if (this.active(generation) && form.isShown()) this.reportError(error);
        }
    }

    private renderHistory(form: LegacyForm, entries: GiftLedgerEntry[]): void {
        const content = form.find(HISTORY);
        const template = content?.getChildByName('Btn_Record') ?? null;
        if (!content || !template) return;
        for (const child of [...content.children]) if (child !== template && child.isValid) child.destroy();
        template.active = false;
        for (const entry of entries) {
            const row = instantiate(template);
            const sender = entry.direction === 'OUT' ? this.playerId : entry.counterpartyId;
            const recipient = entry.direction === 'OUT' ? entry.counterpartyId : this.playerId;
            row.name = `Record_${entry.sequence}`;
            this.player(row, 'Sender', sender);
            this.player(row, 'Recipient', recipient);
            this.setLabel(row, 'Amount/Lb_Increase', entry.direction === 'IN' ? `+${entry.quantity}` : '');
            this.setLabel(row, 'Amount/Lb_Decrease', entry.direction === 'OUT' ? `-${entry.quantity}` : '');
            this.setLabel(row, 'Label', this.time(entry.createdAt));
            row.active = true;
            content.addChild(row);
        }
    }

    private async watchInbox(generation: number): Promise<void> {
        while (this.active(generation)) {
            try {
                const entries = await this.api.inbox(this.inboxCursor);
                if (!this.active(generation)) return;
                this.advance(entries);
                for (const entry of entries) this.eventNode.emit('legacy-gift-received', entry);
                const form = this.forms.get(FORM);
                if (entries.length && form?.isShown()) await this.refresh(form, generation);
            } catch (error: unknown) {
                if (this.active(generation)) this.eventNode.emit('legacy-gifting-push-error', error);
            }
            if (this.active(generation)) await new Promise(resolve => globalThis.setTimeout(resolve, 1_500));
        }
    }

    private showRecipient(form: LegacyForm): void {
        const id = Number.parseInt(this.recipient, 10);
        this.player(form.node, `${GIFT}/Recipient`, Number.isSafeInteger(id) && id > 0 ? id : 0);
    }

    private player(root: Node, path: string, id: number): void {
        this.setLabel(root, `${path}/Player/Lb_Id`, id > 0 ? String(id) : '');
        this.setLabel(root, `${path}/Player/Lb_Name`, id > 0 ? `玩家 ${id}` : '');
        // The entry form omits the extra Player wrapper used by history rows.
        this.setLabel(root, `${path}/Head/Lb_Id`, id > 0 ? String(id) : '');
        this.setLabel(root, `${path}/Head/Lb_Name`, id > 0 ? `玩家 ${id}` : '');
    }

    private writeInput(form: LegacyForm, path: string, value: string): void {
        const label = form.find(`${GIFT}/${path}`)?.getComponent(Label);
        if (label) label.string = value;
    }

    private setLabel(root: Node, path: string, value: string): void {
        let node: Node | null = root;
        for (const part of path.split('/')) node = node?.getChildByName(part) ?? null;
        const label = node?.getComponent(Label);
        if (label) label.string = value;
    }

    private click(node: Node | null, handler: () => void): void {
        if (!node) return;
        node.on(Button.EventType.CLICK, handler);
        this.disposers.push(() => { if (node.isValid) node.off(Button.EventType.CLICK, handler); });
    }

    private enableConfirm(form: LegacyForm | null, enabled: boolean): void {
        const button = form?.find(`${GIFT}/Btn_Confirm`)?.getComponent(Button);
        if (button) button.interactable = enabled;
    }

    private advance(entries: GiftLedgerEntry[]): void {
        for (const entry of entries) this.inboxCursor = Math.max(this.inboxCursor, Number(entry.sequence) || 0);
    }

    private active(generation: number): boolean { return generation === this.generation && this.eventNode.isValid; }
    private time(value: string): string {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
    }

    private clearBindings(): void {
        this.keyboard?.dispose();
        this.keyboard = null;
        for (const dispose of this.disposers.splice(0)) dispose();
    }
}
