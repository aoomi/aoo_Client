import { Button, Node } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';

interface ManagementContext {
    id?: number;
    clubId?: number;
    unionId?: number;
    minister?: number;
    myisminister?: number;
}
export class LegacyClubManagementController {
    private readonly disposers: Array<() => void> = [];
    private context: ManagementContext = {};
    private generation = 0;
    private confirmationPending = false;

    public constructor(
        private readonly forms: LegacyFormManager,
        private readonly client: ProtocolClient,
        private readonly playerId: number,
    ) {}

    public install(): void {
        this.forms.register('ui/club/ClubAdmin', { zOrder: 9, lifecycle: {
            onShow: (form, context) => { this.dispose(); this.bindManager(form); this.showManager(form, context); },
            onClose: () => this.dispose(), onDestroy: () => this.dispose(),
        }});

    }

    public dispose(): void { this.generation++; this.confirmationPending = false; for (const dispose of this.disposers.splice(0)) dispose(); }

    private bindManager(form: LegacyForm): void {
        for (const name of ['btn_close', 'btn_outclub', 'btn_dissolveclub']) this.requiredButton(form.node, name);
        this.click(form.node, 'btn_close', () => this.forms.close('ui/club/ClubAdmin'));
        this.click(form.node, 'btn_outclub', () => { void this.confirmExit(); });
        this.click(form.node, 'btn_dissolveclub', () => {
            this.forms.close('ui/club/ClubAdmin');
            void this.confirmDissolveClub();
        });
    }

    private showManager(form: LegacyForm, value: unknown): void {
        this.context = this.asContext(value);
        const minister = Number(this.context.minister ?? this.context.myisminister ?? 0);
        this.active(form.node, 'btn_outclub', minister !== 2);
        this.active(form.node, 'btn_dissolveclub', minister === 2);
    }

    private async confirmExit(): Promise<void> {
        const clubId = this.clubId(this.context);
        await this.confirmAction('确定退出当前俱乐部吗？', () => this.exitClub(clubId));
    }

    private async confirmAction(message: string, action: () => Promise<void>): Promise<void> {
        if (this.confirmationPending) return;
        const generation = this.generation;
        this.confirmationPending = true;
        const confirm = await this.forms.show('UIMessage', null, null, message);
        if (generation !== this.generation) return;
        if (!confirm || !confirm.node.isValid || !confirm.node.parent) { this.confirmationPending = false; return; }
        const sure = this.requiredButton(confirm.node, 'btnSure');
        const cancel = this.requiredButton(confirm.node, 'btnCancel');
        cancel.active = true;
        let settled = false;
        const cleanup = (): void => {
            if (settled) return;
            settled = true;
            sure.off(Button.EventType.CLICK, accept);
            cancel.off(Button.EventType.CLICK, dismiss);
            confirm.node.off(Node.EventType.PARENT_CHANGED, detached);
            this.confirmationPending = false;
            const index = this.disposers.indexOf(cleanup);
            if (index >= 0) this.disposers.splice(index, 1);
        };
        const accept = (): void => {
            if (settled || generation !== this.generation) return;
            cleanup();
            this.forms.close('UIMessage');
            void action();
        };
        const dismiss = (): void => { cleanup(); this.forms.close('UIMessage'); };
        const detached = (): void => {
            // Shared message close handlers may detach during the same button dispatch.
            // Let that dispatch finish before retiring an unconfirmed action.
            void Promise.resolve().then(() => {
                if (!confirm.node.isValid || !confirm.node.parent) cleanup();
            });
        };
        sure.on(Button.EventType.CLICK, accept);
        cancel.on(Button.EventType.CLICK, dismiss);
        confirm.node.on(Node.EventType.PARENT_CHANGED, detached);
        this.disposers.push(cleanup);
    }

    private async exitClub(clubId: number): Promise<void> {
        const generation = this.generation;
        try {
            const gate = await this.client.request<{ type?: number }>('club.CClubKickOutNeedConfirm', { clubId, pid: this.playerId });
            if (generation !== this.generation) return;
            if (Number(gate.type ?? 0) === 1) { await this.tip('您当前身上或保险箱有竞技点，无法申请退出'); return; }
            await this.client.request('club.CClubChangePlayerStatus', { clubId, status: 0x40, audit: false });
            if (generation === this.generation) { this.closeClubForms(); await this.tip('已退出俱乐部'); }
        } catch (error: unknown) { if (generation === this.generation) await this.tip(this.error(error, '退出俱乐部失败')); }
    }

    private async confirmDissolveClub(): Promise<void> {
        const clubId = this.clubId(this.context);
        await this.confirmAction('确定解散当前俱乐部吗？', () => this.dissolveClub(clubId));
    }

    private async dissolveClub(clubId: number): Promise<void> {
        const generation = this.generation;
        try {
            await this.client.request('club.CClubClose', { clubId });
            if (generation === this.generation) { this.closeClubForms(); await this.tip('俱乐部已解散'); }
        } catch (error: unknown) { if (generation === this.generation) await this.tip(this.error(error, '俱乐部解散失败')); }
    }

    private closeClubForms(): void {
        this.forms.close('ui/club/ClubAdmin');
        for (const path of ['ui/club/ClubMain', 'ui/club_1/UIClubMain_1', 'ui/club_2/UIClubMain_2']) this.forms.close(path);
    }
    private clubId(value: ManagementContext): number { return Number(value.id ?? value.clubId ?? 0); }
    private asContext(value: unknown): ManagementContext { return value && typeof value === 'object' ? value as ManagementContext : {}; }
    private active(root: Node, name: string, active: boolean): void { const node = this.requiredButton(root, name); node.active = active; }
    private click(root: Node, name: string, listener: () => void): void { const node = this.requiredButton(root, name); node.on(Button.EventType.CLICK, listener); this.disposers.push(() => node.off(Button.EventType.CLICK, listener)); }
    private requiredButton(root: Node, name: string): Node {
        const matches: Array<{ node: Node; path: string }> = [];
        const visit = (node: Node, path: string): void => {
            if (node.name === name && node.getComponent(Button)) matches.push({ node, path });
            for (const child of node.children) visit(child, `${path}/${child.name}`);
        };
        visit(root, root.name);
        if (matches.length !== 1) throw new Error(`[ClubAdmin] ${name} requires one Button; candidates: ${matches.map(item => item.path).join(', ') || '(none)'}`);
        return matches[0].node;
    }
    private error(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
    private async tip(message: string): Promise<void> { await this.forms.show('UIMessage_Drift', null, null, message); }
}
