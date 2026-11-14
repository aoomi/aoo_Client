import { Button, Label, Layout, Node, ScrollView, Sprite, UITransform, instantiate } from 'cc';
import { UnifiedScroll } from '../../../../Common/Code/UI/UnifiedScroll';
import { PlayerAvatarService } from '../../../../Common/Code/UI/PlayerAvatarService';
import type { ClubBoxBalance, ClubBoxRecord, ClubBoxSource } from './ClubBoxGateway';
import { setClubDynamicLabel } from '../ClubDynamicLabel';

export type ClubBoxOperation = 'store' | 'withdraw';

export interface ClubBoxPlayer {
    id: number | string;
    name: string;
    avatarUrl?: string;
}

export interface ClubBoxActions {
    close(): void;
    requestAmount(operation: ClubBoxOperation, maximum: number): Promise<number | null>;
    notify(message: string): void | Promise<void>;
    report(error: unknown): void;
}

/** Business controller for the ClubSafePanel prefab. */
export class ClubBoxController {
    private readonly staticDisposers: Array<() => void> = [];
    private balance: ClubBoxBalance = { carryCent: 0, bankCent: 0 };
    private view: ScrollView | null = null;
    private requestEpoch = 0;
    private avatarEpoch = 0;
    private operationPending = false;
    private installed = false;
    private disposed = false;

    public constructor(
        private readonly root: Node,
        private readonly source: ClubBoxSource,
        private readonly player: ClubBoxPlayer,
        private readonly actions: ClubBoxActions,
    ) {}

    public install(): void {
        if (this.disposed) throw new Error('ClubBoxController has been disposed');
        if (this.installed) return;
        this.installed = true;
        this.bindClick(this.requireNode('Panel/Header/Close'), () => this.actions.close());
        this.bindClick(this.requireNode('Body/Balance/Store'), () => this.operate('store'));
        this.bindClick(this.requireNode('Body/Balance/Withdraw'), () => this.operate('withdraw'));
        this.view = UnifiedScroll.ensure(this.requireNode('Body/History/List'));
        void this.refresh();
    }

    public async refresh(): Promise<void> {
        const epoch = ++this.requestEpoch;
        try {
            const [balance, records] = await Promise.all([this.source.balance(), this.source.records()]);
            if (this.disposed || epoch !== this.requestEpoch) return;
            this.balance = balance;
            this.renderBalance();
            this.renderRecords(records);
        } catch (error: unknown) {
            if (!this.disposed && epoch === this.requestEpoch) this.actions.report(error);
        }
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.installed = false;
        this.requestEpoch += 1;
        this.operationPending = false;
        for (const dispose of this.staticDisposers.splice(0)) dispose();
        this.clearRecords();
    }

    private async operate(operation: ClubBoxOperation): Promise<void> {
        if (this.operationPending || this.disposed) return;
        this.operationPending = true;
        try {
            const maximum = operation === 'store' ? this.balance.carryCent : this.balance.bankCent;
            const amount = await this.actions.requestAmount(operation, maximum);
            if (amount === null || this.disposed) return;
            if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('请输入正整数积分');
            if (amount > maximum) throw new Error(operation === 'store' ? '携带积分不足' : '保险箱积分不足');
            const delta = operation === 'store' ? amount : -amount;
            this.balance = await this.source.transfer(delta);
            if (this.disposed) return;
            this.renderBalance();
            await this.actions.notify(operation === 'store' ? '存入成功' : '取出成功');
            const records = await this.source.records();
            if (!this.disposed) this.renderRecords(records);
        } catch (error: unknown) {
            if (!this.disposed) this.actions.report(error);
        } finally {
            this.operationPending = false;
        }
    }

    private renderBalance(): void {
        this.setLabel(this.root, 'Body/Balance/Summary/Carry/Value', this.formatNumber(this.balance.carryCent));
        this.setLabel(this.root, 'Body/Balance/Summary/Vault/Value', this.formatNumber(this.balance.bankCent));
    }

    private renderRecords(records: readonly ClubBoxRecord[]): void {
        const content = this.requireNode('Body/History/List/View/Content');
        const template = content.getChildByName('Item');
        if (!template) throw new Error('ClubBox record template is missing');
        this.clearRecords();
        template.active = false;
        const avatarNodes: Node[] = [];
        for (const record of records) {
            const row = instantiate(template);
            row.name = 'RecordItem';
            row.active = true;
            this.setLabel(row, 'User/Profile/Id', String(this.player.id));
            this.setLabel(row, 'User/Profile/Name', this.player.name);
            const stored = record.operateCent > 0;
            this.requireChild(row, 'Action/Store').active = stored;
            this.requireChild(row, 'Action/Withdraw').active = !stored;
            this.requireChild(row, 'Amount/In').active = stored;
            this.requireChild(row, 'Amount/Out').active = !stored;
            this.setLabel(row, stored ? 'Amount/In' : 'Amount/Out',
                `${stored ? '+' : '-'}${this.formatNumber(Math.abs(record.operateCent))}`);
            this.setLabel(row, 'Time', this.formatTime(record.time));
            const avatar = row.getChildByPath('User/Profile/AvatarBox/Mask/Avatar');
            if (avatar) avatarNodes.push(avatar);
            content.addChild(row);
        }
        const layout = content.getComponent(Layout);
        layout?.updateLayout();
        const contentTransform = content.getComponent(UITransform);
        const viewportHeight = this.view?.node.getComponent(UITransform)?.height ?? 0;
        if (contentTransform) {
            const rowHeight = template.getComponent(UITransform)?.height ?? 75;
            contentTransform.setContentSize(contentTransform.width, Math.max(viewportHeight, records.length * rowHeight));
        }
        this.view?.scrollToTop(0);
        this.loadAvatar(avatarNodes, Number(this.player.id), this.player.avatarUrl ?? '');
    }

    private clearRecords(): void {
        this.avatarEpoch += 1;
        const content = this.root.getChildByPath('Body/History/List/View/Content');
        const template = content?.getChildByName('Item');
        for (const child of [...(content?.children ?? [])]) {
            if (child !== template) child.destroy();
        }
    }

    private loadAvatar(nodes: readonly Node[], playerId: number, url: string): void {
        if (nodes.length === 0 || !Number.isSafeInteger(playerId) || playerId <= 0) return;
        const epoch = this.avatarEpoch;
        void PlayerAvatarService.frame(playerId, url).then((frame) => {
            if (this.disposed || epoch !== this.avatarEpoch) return;
            for (const node of nodes) {
                if (!node.isValid) continue;
                const sprite = node.getComponent(Sprite);
                if (sprite) sprite.spriteFrame = frame;
            }
        }).catch(() => undefined);
    }

    private bindClick(node: Node, action: () => void | Promise<void>): void {
        const listener = (): void => { void action(); };
        node.on(Button.EventType.CLICK, listener);
        this.staticDisposers.push(() => {
            if (node.isValid && (node as Node & { _eventProcessor?: unknown })._eventProcessor) {
                node.off(Button.EventType.CLICK, listener);
            }
        });
    }

    private setLabel(root: Node, path: string, value: string): void {
        const label = root.getChildByPath(path)?.getComponent(Label);
        if (!label) throw new Error(`ClubBox label is missing: ${path}`);
        setClubDynamicLabel(label, path, value);
    }

    private requireNode(path: string): Node {
        const node = this.root.getChildByPath(path);
        if (!node) throw new Error(`ClubBox node is missing: ${path}`);
        return node;
    }

    private requireChild(root: Node, path: string): Node {
        const node = root.getChildByPath(path);
        if (!node) throw new Error(`ClubBox record node is missing: ${path}`);
        return node;
    }

    private formatNumber(value: number): string {
        return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
    }

    private formatTime(timestamp: number): string {
        const milliseconds = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
        const date = new Date(milliseconds);
        if (Number.isNaN(date.getTime())) return '';
        const pad = (value: number): string => String(value).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
            + `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
}
