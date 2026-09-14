import { Button, Color, EditBox, Label, Layout, Node, Toggle, instantiate } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { NumpadHandle, NumpadService } from '../../../Common/Code/Runtime/ui/NumpadService';
import { adaptClubModalLandscape } from './LegacyClubLandscapeAdapter';

interface FeeCondition { minWin: number; cost: number; bd: number }
interface FeeRule { type: 1 | 2 | 5; conditions: FeeCondition[] }
interface RoomConfig {
    roomName?: string;
    roomSportsThreshold?: number;
    JoinGamePoint?: number;
    roomSportsAutoDismiss?: number;
    autoDismiss?: number;
    deskColor?: number;
    roomSportsType?: number;
    roomSportsEveryoneConsume?: number;
    roomSportsPrizePool?: number;
    roomSportsPercentage?: number;
    roomSportsThresholdList?: Array<{ winScore?: number; cost?: number; prizePool?: number }>;
    rule?: FeeRule;
    [key: string]: unknown;
}
interface RoomFeeContext {
    clubId?: number;
    unionId?: number;
    roomKey?: number;
    cfgData?: { bRoomConfigure?: RoomConfig } | RoomConfig;
    onTemplateSaved?: (room?: unknown) => void | Promise<void>;
    [key: string]: unknown;
}

const FeeProtocolTypes = [2, 5, 1] as const;

/** XQP ClubRoomFeeWindow 在 Aoo 表单与协议层上的等价实现。 */
export class ClubRoomFeeController {
    private readonly path = 'ui/club/UIClubRoomFee';
    private readonly disposers: Array<() => void> = [];
    private readonly rowDisposers: Array<() => void> = [];
    private readonly numpadService = new NumpadService();
    private numpad: NumpadHandle | null = null;
    private form: LegacyForm | null = null;
    private context: RoomFeeContext = {};
    private gameType = 0;
    private rulePacket: Record<string, unknown> = {};
    private feeType = 0;
    private saving = false;

    public constructor(private readonly forms: LegacyFormManager, private readonly client: ProtocolClient) {}

    public install(): void {
        this.forms.register(this.path, { zOrder: 13, lifecycle: {
            onCreate: (form) => { adaptClubModalLandscape(form.node); this.bind(form); },
            onShow: (form, context, gameType, packet) => {
                adaptClubModalLandscape(form.node);
                this.show(form, context, gameType, packet);
            },
            onClose: () => { this.form = null; this.clearRows(); this.closeNumpad(); },
        }});
    }

    public dispose(): void {
        this.clearRows();
        this.closeNumpad();
        for (const dispose of this.disposers.splice(0)) dispose();
    }

    private bind(form: LegacyForm): void {
        this.click(form.node, 'Btn_Back', () => this.forms.close(this.path));
        this.click(form.node, 'Btn_Close', () => {
            this.forms.close(this.path);
            this.forms.close('UICreateRoom');
        });
        this.click(form.node, 'Btn_Confirm', () => { void this.save(); });
        for (let index = 0; index < 3; index += 1) {
            const toggle = this.desc(form.node, `Option_${['Stage', 'AA', 'Ratio'][index]}`)?.getComponent(Toggle);
            if (!toggle) continue;
            const change = () => { if (toggle.isChecked) this.selectFeeType(index); };
            toggle.node.on(Toggle.EventType.TOGGLE, change);
            this.disposers.push(() => toggle.node.off(Toggle.EventType.TOGGLE, change));
        }
        for (let index = 0; index < 4; index += 1) {
            const toggle = this.desc(form.node, `Option_${index}`)?.getComponent(Toggle);
            if (!toggle) continue;
            const change = () => { if (toggle.isChecked) this.context.deskColor = index; };
            toggle.node.on(Toggle.EventType.TOGGLE, change);
            this.disposers.push(() => toggle.node.off(Toggle.EventType.TOGGLE, change));
        }
        this.bindValueButton(form.node, 'EntryCent/Btn_Value', '入场分数');
        this.bindValueButton(form.node, 'ExitCent/Btn_Value', '离场分数');
        this.bindValueButton(form.node, 'AA/Fee/Btn_Value', '每人扣除');
        this.bindValueButton(form.node, 'AA/Guarantee/Btn_Value', '圈主保底');
        this.bindValueButton(form.node, 'Ratio/WinnerRate/Btn_Value', '赢家比例');
        this.bindValueButton(form.node, 'Ratio/GuaranteeRate/Btn_Value', '圈主保底比例');
    }

    private show(form: LegacyForm, value: unknown, gameType: unknown, packet: unknown): void {
        this.form = form;
        this.context = value && typeof value === 'object' ? value as RoomFeeContext : {};
        this.gameType = Number(gameType ?? 0);
        this.rulePacket = packet && typeof packet === 'object' ? { ...(packet as Record<string, unknown>) } : {};
        const wrapped = this.context.cfgData;
        const config = wrapped && typeof wrapped === 'object' && 'bRoomConfigure' in wrapped
            ? (wrapped as { bRoomConfigure?: RoomConfig }).bRoomConfigure ?? {}
            : (wrapped as RoomConfig | undefined) ?? {};
        this.edit(form.node, 'NameInput', String(config.roomName ?? ''));
        const baseScore = Math.max(1, Number(this.rulePacket.baseScore ?? 1));
        this.value(form.node, 'EntryCent/Btn_Value', Number(config.JoinGamePoint ?? config.roomSportsThreshold ?? baseScore * 100));
        this.value(form.node, 'ExitCent/Btn_Value', Number(config.roomSportsAutoDismiss ?? config.autoDismiss ?? baseScore * 50));
        const deskColor = Math.max(0, Math.min(3, Number(config.deskColor ?? 0)));
        this.context.deskColor = deskColor;
        const deskToggle = this.desc(form.node, `Option_${deskColor}`)?.getComponent(Toggle);
        if (deskToggle) deskToggle.isChecked = true;
        const rule = config.rule;
        const protocolType = Number(rule?.type ?? 0);
        this.feeType = protocolType ? Math.max(0, FeeProtocolTypes.indexOf(protocolType as 1 | 2 | 5)) : Math.max(0, Math.min(2, Number(config.roomSportsType ?? 0)));
        const conditions = rule?.conditions ?? this.legacyConditions(config);
        this.renderStage(this.feeType === 0 ? conditions : []);
        if (this.feeType === 1) {
            this.value(form.node, 'AA/Fee/Btn_Value', conditions[0]?.cost ?? config.roomSportsEveryoneConsume ?? 0);
            this.value(form.node, 'AA/Guarantee/Btn_Value', conditions[0]?.bd ?? config.roomSportsPrizePool ?? 0);
        } else if (this.feeType === 2) {
            this.value(form.node, 'Ratio/WinnerRate/Btn_Value', conditions[0]?.cost ?? config.roomSportsPercentage ?? 0);
            this.value(form.node, 'Ratio/GuaranteeRate/Btn_Value', conditions[0]?.bd ?? config.roomSportsPrizePool ?? 0);
        }
        const selected = this.desc(form.node, `Option_${['Stage', 'AA', 'Ratio'][this.feeType]}`)?.getComponent(Toggle);
        if (selected) selected.isChecked = true;
        this.selectFeeType(this.feeType);
    }

    private legacyConditions(config: RoomConfig): FeeCondition[] {
        return (config.roomSportsThresholdList ?? []).map((row) => ({
            minWin: Number(row.winScore ?? 0),
            cost: Number(row.cost ?? 0),
            bd: Number(row.prizePool ?? 0),
        }));
    }

    private selectFeeType(index: number): void {
        this.feeType = Math.max(0, Math.min(2, index));
        const root = this.form?.node;
        if (!root) return;
        const names = ['Stage', 'AA', 'Ratio'];
        names.forEach((name, current) => {
            const option = this.desc(root, `Option_${name}`);
            const toggle = option?.getComponent(Toggle);
            if (toggle && toggle.isChecked !== (current === this.feeType)) toggle.isChecked = current === this.feeType;
            const label = this.desc(option ?? root, 'Label')?.getComponent(Label);
            if (label) label.color = current === this.feeType ? new Color(198, 111, 75, 255) : new Color(80, 93, 137, 255);
            this.active(root, `FeeValue/${name}`, current === this.feeType);
            this.active(root, `Help/Lb_${name}`, current === this.feeType);
        });
        this.active(root, 'List', this.feeType === 0);
        if (this.feeType === 0 && this.stageRows(root).length === 0) this.appendStage({ minWin: 0, cost: 0, bd: 0 });
    }

    private renderStage(rows: FeeCondition[]): void {
        const root = this.form?.node;
        const content = root ? this.desc(root, 'List/Content') : null;
        if (!root || !content) return;
        this.clearRows();
        for (const child of [...content.children]) child.destroy();
        for (const row of rows.slice(0, 10)) this.appendStage(row);
        if (rows.length === 0) this.appendStage({ minWin: 0, cost: 0, bd: 0 });
        content.getComponent(Layout)?.updateLayout();
    }

    private appendStage(condition: FeeCondition): void {
        const root = this.form?.node;
        const template = root ? this.desc(root, 'Stage/RowTemplate') : null;
        const content = root ? this.desc(root, 'List/Content') : null;
        if (!root || !template || !content || content.children.length >= 10) return;
        template.active = false;
        const row = instantiate(template);
        row.name = `Row_${content.children.length}`;
        row.active = true;
        this.value(row, 'Threshold/Btn_Value', condition.minWin);
        this.value(row, 'Cost/Btn_Value', condition.cost);
        this.value(row, 'Guarantee/Btn_Value', condition.bd);
        for (const [path, title] of [['Threshold/Btn_Value', '超过分数'], ['Cost/Btn_Value', '扣除分数'], ['Guarantee/Btn_Value', '保底分数']] as const) {
            this.bindRowValueButton(row, path, title);
        }
        const add = this.desc(row, 'Btn_Add');
        const remove = this.desc(row, 'Btn_Remove');
        const first = content.children.length === 0;
        if (add) add.active = first;
        if (remove) remove.active = !first;
        this.rowClick(add, () => {
            if (content.children.length >= 10) return void this.tip('最多只能设置10个阶梯');
            this.appendStage({ minWin: 0, cost: 0, bd: 0 });
            content.getComponent(Layout)?.updateLayout();
        });
        this.rowClick(remove, () => {
            if (content.children.length <= 1) return;
            row.destroy();
            content.getComponent(Layout)?.updateLayout();
        });
        content.addChild(row);
    }

    private bindValueButton(root: Node, path: string, title: string): void {
        const button = this.desc(root, path);
        this.clickNode(button, () => { if (button) void this.openNumpad(button, title); }, this.disposers);
    }

    private bindRowValueButton(root: Node, path: string, title: string): void {
        const button = this.desc(root, path);
        this.clickNode(button, () => { if (button) void this.openNumpad(button, title); }, this.rowDisposers);
    }

    private async openNumpad(button: Node, title: string): Promise<void> {
        const form = this.form;
        const label = button.getComponentInChildren(Label);
        if (!form || !label) return;
        this.closeNumpad();
        let text = label.string === '0' ? '' : label.string;
        const close = () => this.closeNumpad();
        this.numpad = await this.numpadService.open(form.node, () => this.forms.loadCommonNumpad(), {
            close,
            confirm: close,
        }, { digitCount: 10, maxDigits: 13, decimalPlaces: 2, value: () => text, setValue: value => { text = value; label.string = value || '0'; } }, { title });
    }

    private closeNumpad(): void { this.numpad?.dispose(); this.numpad = null; }

    private async save(): Promise<void> {
        const root = this.form?.node;
        if (!root || this.saving) return;
        const roomName = this.desc(root, 'NameInput')?.getComponent(EditBox)?.string.trim() ?? '';
        const entry = this.number(root, 'EntryCent/Btn_Value');
        const exit = this.number(root, 'ExitCent/Btn_Value');
        if (!roomName) return void this.tip('房间名称不能为空');
        if (roomName.length > 16) return void this.tip('房间名称不能超过16个字符');
        if (!Number.isFinite(entry) || entry <= 0) return void this.tip('入场分数必须大于0');
        if (!Number.isFinite(exit) || exit < 0 || exit >= entry) return void this.tip('离场分数必须大于等于0且小于入场分数');
        const conditions = this.collectConditions(root);
        if (!conditions) return;
        const rule: FeeRule = { type: FeeProtocolTypes[this.feeType], conditions };
        const unionId = Number(this.context.unionId ?? 0);
        const stageList = this.feeType === 0 ? conditions.map((row) => ({ winScore: row.minWin, clubCent: row.cost, clubCentCost: row.bd })) : [];
        this.saving = true;
        try {
            const savedRoom = await this.client.request(unionId > 0 ? 'union.CUnionCreateRoom' : 'club.CClubCreateGameSet', {
                ...this.rulePacket,
                clubId: Number(this.context.clubId ?? 0),
                unionId,
                gameIndex: Number(this.context.roomKey ?? 0),
                roomName,
                deskColor: Number(this.context.deskColor ?? 0),
                roomSportsThreshold: entry,
                JoinGamePoint: entry,
                autoDismiss: exit,
                roomSportsType: this.feeType,
                roomSportsEveryoneConsume: this.feeType === 1 ? conditions[0]?.cost ?? 0 : 0,
                percentage: this.feeType === 2 ? conditions[0]?.cost ?? 0 : 0,
                prizePool: this.feeType === 0 ? 0 : conditions[0]?.bd ?? 0,
                bigWinnerConsumeList: stageList,
                rule,
            });
            this.forms.close(this.path);
            this.forms.close('UICreateRoom');
            await this.context.onTemplateSaved?.(savedRoom);
        } catch (error) {
            await this.tip(error instanceof Error ? error.message : '保存房间费用失败');
        } finally {
            this.saving = false;
        }
    }

    private collectConditions(root: Node): FeeCondition[] | null {
        if (this.feeType === 1) {
            const cost = this.number(root, 'AA/Fee/Btn_Value');
            const bd = this.number(root, 'AA/Guarantee/Btn_Value');
            if (!Number.isFinite(cost) || !Number.isFinite(bd) || cost < 0 || bd < 0) { void this.tip('AA房费不能小于0'); return null; }
            return [{ minWin: -9999999, cost, bd }];
        }
        if (this.feeType === 2) {
            const cost = this.number(root, 'Ratio/WinnerRate/Btn_Value');
            const bd = this.number(root, 'Ratio/GuaranteeRate/Btn_Value');
            if (cost < 0 || cost > 100 || bd < 0 || bd > 100) { void this.tip('比例必须在0到100之间'); return null; }
            return [{ minWin: -9999999, cost, bd }];
        }
        const conditions = this.stageRows(root).map((row) => ({
            minWin: this.number(row, 'Threshold/Btn_Value'),
            cost: this.number(row, 'Cost/Btn_Value'),
            bd: this.number(row, 'Guarantee/Btn_Value'),
        }));
        if (conditions.some((row) => !Object.values(row).every(Number.isFinite) || row.cost < 0 || row.bd < 0)) {
            void this.tip('阶梯房费数值格式不正确'); return null;
        }
        for (let index = 1; index < conditions.length; index += 1) {
            if (conditions[index]!.minWin <= conditions[index - 1]!.minWin) {
                void this.tip('阶梯超过分数必须依次递增'); return null;
            }
        }
        return conditions;
    }

    private stageRows(root: Node): Node[] { return this.desc(root, 'List/Content')?.children ?? []; }
    private number(root: Node, path: string): number { return Number(this.desc(root, path)?.getComponentInChildren(Label)?.string ?? 0); }
    private value(root: Node, path: string, value: unknown): void { const label = this.desc(root, path)?.getComponentInChildren(Label); if (label) label.string = String(value ?? 0); }
    private edit(root: Node, name: string, value: string): void { const edit = this.desc(root, name)?.getComponent(EditBox); if (edit) edit.string = value; }
    private active(root: Node, path: string, value: boolean): void { const node = this.desc(root, path); if (node) node.active = value; }
    private clearRows(): void { for (const dispose of this.rowDisposers.splice(0)) dispose(); }
    private click(root: Node, path: string, action: () => void): void { this.clickNode(this.desc(root, path), action, this.disposers); }
    private rowClick(node: Node | null, action: () => void): void { this.clickNode(node, action, this.rowDisposers); }
    private clickNode(node: Node | null, action: () => void, disposers: Array<() => void>): void {
        if (!node) return;
        node.on(Button.EventType.CLICK, action);
        disposers.push(() => { if (node.isValid) node.off(Button.EventType.CLICK, action); });
    }
    private desc(root: Node, path: string): Node | null {
        let current: Node | null = root;
        for (const part of path.split('/')) {
            if (!part) continue;
            if (current?.name === part) continue;
            current = current?.getChildByName(part) ?? this.deep(current, part);
        }
        return current;
    }
    private deep(root: Node | null, name: string): Node | null {
        if (!root) return null;
        for (const child of root.children) { if (child.name === name) return child; const found = this.deep(child, name); if (found) return found; }
        return null;
    }
    private async tip(message: string): Promise<void> { await this.forms.show('UIMessage_Drift', null, null, message); }
}
