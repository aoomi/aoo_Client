import { Button, EditBox, Label, Layout, Node, RichText, ScrollView, Toggle, UITransform, instantiate } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { NumpadHandle, NumpadService } from '../../../Common/Code/Runtime/ui/NumpadService';
import { clubPlayerDisplayId, setClubDynamicLabel } from './ClubDynamicLabel';
import { ScrollEvents } from '../../../Common/Code/UI/UnifiedScroll';

interface PromotionContext {
    id?: number; clubId?: number; unionId?: number; minister?: number; levelPromotion?: number;
    isPromotionManage?: number; promotionManagePid?: number; invite?: number; skinType?: number;
    pid?: number; player?: { pid?: number; displayId?: number | string; name?: string }; opClubId?: number;
    warningScope?: 'personal' | 'branch' | 'club';
    partnerPid?: number; myisPartner?: number;
}
interface PromotionRow {
    consume?: number; sportsPointConsume?: number; theoryEntryFee?: number; playerTotalPoint?: number;
    sumSportsPoint?: number; sportsPointWarning?: number; personalSportsPointWarning?: number;
    pid?: number; displayId?: number | string; name?: string; number?: number; setCount?: number;
    /** 大赢家场次，协议字段保持 winner。 */
    winner?: number;
    entryFee?: number; actualEntryFee?: number;
    shareType?: number; shareValue?: number; shareFixedValue?: number; scorePoint?: number; clubCent?: number;
    sumClubCent?: number; level?: number; myisminister?: number;
    clubCentWarning?: number; personalClubCentWarning?: number; warnStatus?: number;
    alivePoint?: number; alivePointStatus?: number; eliminatePoint?: number; clubSign?: number; createId?: number;
    sportsPoint?: number; allowSportsPoint?: number; examineStatus?: number; totalPoint?: number;
}
interface PromotionResult { clubPromotionLevelItemList?: PromotionRow[]; showList?: number[]; showListSecond?: number[]; dateType?: number[] }
// 显示字段 ID 沿用服务端合同；贡献值是原活跃积分的分成收益，不是实际报名费。
const CAPTAIN_COLUMNS = [
    { id: 0, name: 'RoomNum', row: 'lb_jushu' },
    { id: 3, name: 'Commission', row: 'lb_bili' },
    { id: 4, name: 'ContributionCent', row: 'lb_contributionCent' },
    { id: 6, name: 'Record', row: 'lb_record' },
    { id: 7, name: 'ClubCent', row: 'lb_curSportPoint' },
    { id: 8, name: 'ClubAllCent', row: 'lb_sumSportPoint' },
    { id: 9, name: 'TeamWarning', row: 'lb_teamWarning' },
    { id: 10, name: 'PlayerWarning', row: 'lb_personalWarning' },
] as const;
const CAPTAIN_SECOND_COLUMNS = [
    { id: 0, name: 'MyCommission' }, { id: 1, name: 'TeamWarning' }, { id: 2, name: 'PlayerWarning' },
] as const;

const CAPTAIN_SORT_FIELDS = {
    PlayerNum: (row: PromotionRow): number => Number(row.number ?? 0),
    RoomNum: (row: PromotionRow): number => Number(row.setCount ?? 0),
    Commission: (row: PromotionRow): number => Number(row.shareValue ?? 0),
    // 贡献值沿用原活跃积分的分成收益口径，不是 actualEntryFee 实际报名费。
    ContributionCent: (row: PromotionRow): number => Number(row.scorePoint ?? 0),
    Record: (row: PromotionRow): number => Number(row.sportsPointConsume ?? 0),
    PlayerCent: (row: PromotionRow): number => Number(row.clubCent ?? row.sportsPoint ?? 0),
    TeamAllCent: (row: PromotionRow): number => Number(row.sumClubCent ?? row.sumSportsPoint ?? 0),
    TeamWarning: (row: PromotionRow): number => Number(row.sportsPointWarning ?? row.clubCentWarning ?? 0),
    PlayerWarning: (row: PromotionRow): number => Number(row.personalSportsPointWarning ?? row.personalClubCentWarning ?? 0),
    // winner 表示大赢家场次。
    BigWinNum: (row: PromotionRow): number => Number(row.winner ?? 0),
} as const;
interface CaptainColumnBinding {
    panel: Node;
    toggles: Map<number, Toggle>;
    secondary: Map<number, Toggle>;
    headers: Map<number, Node>;
}
interface RecordPlayer { pid?: number; name?: string; point?: number; clubCent?: number }
interface PromotionRecord { roomKey?: number | string; roomID?: number; gameType?: number; configName?: string; roomState?: number; endTime?: string | number; roomCard?: number; unionId?: number; playerList?: string | RecordPlayer[] }
interface LegacyListEnvelope<T> { items?: T[]; list?: T[] }

export class LegacyClubPromotionController {
    private readonly disposers: Array<() => void> = [];
    private readonly rowDisposers = new Map<Node, Array<() => void>>();
    private context: PromotionContext = {};
    private form: LegacyForm | null = null;
    private type = 0;
    private subordinateLoading = false;
    private selectedPid = 0;
    private setPid = 0;
    private searchParentPid = 0;
    private recordForm: LegacyForm | null = null;
    private recordContext: PromotionContext = {};
    private recordPage = 1;
    private recordPages = 1;
    private activeForm: LegacyForm | null = null;
    private activeContext: PromotionContext & PromotionRow = {};
    private activePage = 1;
    private activeItems: Array<{ configId?: number; value?: number }> = [];
    private warningContext: PromotionContext & PromotionRow & { isPersonal?: boolean; pidList?: number[] } = {};
    private shareContext: PromotionContext & PromotionRow & { isSelf?: boolean; doShareValue?: number; minShareValue?: number; doShareFixedValue?: number; minShareFixedValue?: number; shareType?: number; detailType?: number; reservedValue?: number; promotionCalcActiveItemList?: Array<{ configId: number; value: number }> } = {};
    private sectionContext: PromotionContext & { opClubId?: number; opPid?: number; unionFlag?: number; isSelf?: boolean; unionSectionId?: number; minAllowShareToValue?: number; shareToSelfValue?: number } = {};
    private sectionItems: Array<Record<string, unknown>> = [];
    private numpad: NumpadHandle | null = null;
    private readonly captainNodes = new WeakSet<Node>();
    private readonly captainRows = new Map<Node, Set<Node>>();
    private readonly captainColumns = new Map<Node, CaptainColumnBinding>();
    private captainShowList: number[] = CAPTAIN_COLUMNS.map(column => column.id);
    private captainShowSecond: number[] = CAPTAIN_SECOND_COLUMNS.map(column => column.id);
    private captainData: PromotionRow[] = [];
    private captainSortKey: keyof typeof CAPTAIN_SORT_FIELDS | null = null;
    private captainSortAscending = false;
    private savingCaptainColumns = false;
    private managerRequest = 0;
    private readonly numpadService = new NumpadService();

    public constructor(
        private readonly forms: LegacyFormManager,
        private readonly client: ProtocolClient,
        private readonly playerId: number,
        private readonly lobbyNode: Node,
    ) {}

    public install(): void {
        for (const path of ['ui/club/ClubCaptain', 'ui/club_2/UIPromoterAllManager_2']) this.forms.register(path, { zOrder: 9, lifecycle: {
            onCreate: (form) => this.bindManager(form, path), onShow: (form, value) => this.showManager(form, value),
            onClose: (form) => { this.managerRequest += 1; const columns = this.captainColumns.get(form.node); if (columns) columns.panel.active = false; this.clearRows(form.node); this.captainData = []; this.form = null; },
        }});
        for (const [path, level] of [['ui/club/UIClubPromoterAdd', false], ['ui/club/UIClubPromoterLevelAdd', true]] as Array<[string, boolean]>) this.forms.register(path, { zOrder: 10, lifecycle: {
            onCreate: (form) => this.bindAdd(form, path, level), onShow: (form, value) => this.showAdd(form, value),
        }});
        for (const path of ['ui/club/ClubPromoterSet', 'ui/club_2/UIPromoterSet_2']) this.forms.register(path, { zOrder: 10, lifecycle: {
            onCreate: (form) => this.bindSet(form, path), onShow: (form, value) => this.showSet(form, value),
        }});
        this.forms.register('ui/club/UIPromoterXiaShuList', { zOrder: 10, lifecycle: {
            onCreate: (form) => this.bindSubordinates(form), onShow: (form, value) => this.showSubordinates(form, value),
            onClose: (form) => { this.managerRequest += 1; this.clearRows(form.node); this.form = null; },
        }});
        this.forms.register('ui/club/UIPromoterXIaShuAdd', { zOrder: 11, lifecycle: {
            onCreate: (form) => this.bindSubordinateAdd(form), onShow: (form, value) => this.showSubordinateAdd(form, value),
        }});
        this.forms.register('ui/club/UIPromoterRecordUser', { zOrder: 11, lifecycle: {
            onCreate: (form) => this.bindRecords(form), onShow: (form, value) => this.showRecords(form, value),
            onClose: (form) => { this.clearRows(form.node); this.recordForm = null; },
        }});
        this.forms.register('ui/club/UIPromoterSetActive', { zOrder: 11, lifecycle: {
            onCreate: (form) => this.bindActive(form), onShow: (form, value) => this.showActive(form, value),
        }});
        this.forms.register('ui/club/UIPromoterSetActiveDetail', { zOrder: 12, lifecycle: {
            onCreate: (form) => this.bindActiveDetail(form), onShow: (form, value) => this.showActiveDetail(form, value),
            onClose: (form) => { this.clearRows(form.node); this.activeForm = null; },
        }});
        this.forms.register('ui/club/UIPromoterSetActiveNum', { zOrder: 11, lifecycle: {
            onCreate: (form) => this.bindActiveNum(form), onShow: (form, value) => this.showActiveNum(form, value),
        }});
        this.forms.register('ui/club/UIPromoterSetActiveReport', { zOrder: 11, lifecycle: {
            onCreate: (form) => this.bindActiveReport(form), onShow: (form, value) => this.showActiveReport(form, value),
            onClose: (form) => { this.clearRows(form.node); this.activeForm = null; },
        }});
        for (const path of ['ui/club/UISetClubCentWarning', 'ui/club_2/UISetClubCentWarning_2']) this.forms.register(path, { zOrder: 11, lifecycle: {
            onCreate: (form) => this.bindWarning(form, path), onShow: (form, value) => this.showWarning(form, path, value),
        }});
        this.forms.register('ui/club_2/UIChangeClubCentWarning_2', { zOrder: 11, lifecycle: {
            onCreate: (form) => this.bindEliminate(form), onShow: (form, value) => this.showEliminate(form, value),
        }});
        for (const path of ['ui/club/UIPromoterAllReport', 'ui/club_2/UIPromoterAllReport_2']) this.forms.register(path, { zOrder: 11, lifecycle: {
            onCreate: (form) => this.bindAllReport(form, path), onShow: (form, value) => this.showAllReport(form, path, value),
            onClose: (form) => { this.clearRows(form.node); this.activeForm = null; },
        }});
        for (const path of ['ui/club/ClubPromoterView', 'ui/club_2/UIPromoterShowSetting_2']) this.forms.register(path, { zOrder: 11, lifecycle: {
            onCreate: (form) => this.bindShowSetting(form, path), onShow: (form, value) => this.showShowSetting(form, value),
        }});
        this.forms.register('ui/club/UIPromoterPowerOp', { zOrder: 11, lifecycle: { onCreate: (form) => this.bindPower(form), onShow: (form, value) => this.showPower(form, value) }});
        this.forms.register('ui/club/UIClubPromotionDetail', { zOrder: 11, lifecycle: { onCreate: (form) => this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIClubPromotionDetail')), onShow: (form, value) => this.showPromotionDetail(form, value) }});
        this.forms.register('ui/club/UIPromoterSM', { zOrder: 11, lifecycle: { onCreate: (form) => this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIPromoterSM')) }});
        this.forms.register('ui/club/UIPromoterMsg', { zOrder: 11, lifecycle: { onCreate: (form) => this.bindPromotionMsg(form), onShow: (form, value) => this.showPromotionMsg(form, value), onClose: (form) => { this.clearRows(form.node); this.activeForm = null; } }});
        this.forms.register('ui/club/UIPromoterManager', { zOrder: 10, lifecycle: { onCreate: (form) => this.bindPromotionManager(form), onShow: (_form, value) => { this.context = this.value(value); } }});
        for (const [path, self] of [['ui/club/UIUserSetBaoMingFei', false], ['ui/club/UIUserSelfBaoMingFei', true]] as Array<[string, boolean]>) this.forms.register(path, { zOrder: 12, lifecycle: { onCreate: (form) => this.bindShare(form, path, self), onShow: (form, value) => this.showShare(form, value, self) }});
        this.forms.register('ui/club/UIUserSetBaoMingFeiDetail', { zOrder: 12, lifecycle: { onCreate: (form) => this.bindShareDetail(form), onShow: (form, value) => this.showShareDetail(form, value), onClose: (form) => { this.clearRows(form.node); this.activeForm = null; } }});
        this.forms.register('ui/club/UIUserSetSection', { zOrder: 12, lifecycle: { onCreate: (form) => this.bindSection(form), onShow: (form, value) => this.showSection(form, value), onClose: (form) => { this.clearRows(form.node); this.activeForm = null; } }});
        this.forms.register('ui/club/UIUserChangeSection', { zOrder: 13, lifecycle: { onCreate: (form) => this.bindChangeSection(form), onShow: (form, value) => this.showChangeSection(form, value) }});
        this.forms.register('ui/club/UIUserSetReservedBaoMingFei', { zOrder: 13, lifecycle: { onCreate: (form) => this.bindReserved(form), onShow: (form, value) => this.showReserved(form, value) }});
    }

    public dispose(): void { this.numpad?.dispose(); this.numpad = null; this.clearRows(); for (const dispose of this.disposers.splice(0)) dispose(); this.captainColumns.clear(); this.captainData = []; this.captainSortKey = null; }

    private bindManager(form: LegacyForm, path: string): void {
        if (path === 'ui/club/ClubCaptain') {
            this.markCaptain(form.node);
            this.bindCaptainColumns(form.node);
            for (const name of ['btn_close', 'btn_search', 'btn_addPromoter', 'btn_yaoqing', 'btn_setShowData', 'searchInput', 'content', 'demo', ...Array.from({ length: 7 }, (_, i) => `btn_tian${i}`)]) {
                if (!this.desc(form.node, name)) throw new Error(`[ClubCaptain] 缺少必需节点 ${name}`);
            }
            const demo = this.desc(form.node, 'demo')!;
            demo.active = false;
            for (const name of ['lb_userName', 'lb_userId', 'lb_playerNum', 'lb_jushu', 'lb_bili', 'lb_contributionCent', 'lb_bigWinNum', 'lb_record', 'lb_teamWarning', 'lb_personalWarning', 'lb_curSportPoint', 'lb_sumSportPoint', 'controlNode', 'btn_ShowBtn']) {
                if (!this.desc(demo, name)) throw new Error(`[ClubCaptain] Demo 缺少必需节点 ${name}`);
            }
        }
        this.click(form.node, 'btn_close', () => this.forms.close(path));
        this.click(form.node, 'btn_search', () => { void this.load(); });
        this.click(form.node, 'btn_commonOp', () => this.selectManagerPeriod(-1));
        for (let i = 0; i <= 6; i += 1) this.click(form.node, `btn_tian${i}`, () => this.selectManagerPeriod(i));
        this.click(form.node, 'btn_addPromoter', () => { void this.forms.show('ui/club/UIClubPromoterLevelAdd', this.context); });
        this.click(form.node, 'btn_yaoqing', () => { void this.forms.show('ui/club/UIClubPromoterAdd', this.context); });
        this.click(form.node, 'btn_setShowData', () => {
            const columns = this.captainColumns.get(form.node);
            if (columns) { if (Number(this.context.minister ?? 0) === 2) columns.panel.active = true; return; }
            void this.forms.show(Number(this.context.skinType ?? 0) === 2 ? 'ui/club_2/UIPromoterShowSetting_2' : 'ui/club/ClubPromoterView', this.context);
        });
    }

    private captainRequired(root: Node, name: string, accepts: (node: Node) => boolean, excluded?: Node): Node {
        const matches: { node: Node; path: string }[] = [];
        const visit = (node: Node, path: string): void => {
            if (node === excluded) return;
            if (node.name === name && accepts(node)) matches.push({ node, path });
            for (const child of node.children) visit(child, `${path}/${child.name}`);
        };
        visit(root, root.name);
        if (matches.length !== 1) throw new Error(`[ClubCaptain] ${name}: ${matches.length ? matches.map(match => match.path).join(', ') : `missing below ${root.name}`}`);
        return matches[0].node;
    }
    private bindCaptainColumns(root: Node): void {
        const panel = this.captainRequired(root, 'ShowSet', node => !!node.getComponent(UITransform));
        const primary = this.captainRequired(panel, 'AllToggleNode', node => !!node.getComponent(Layout));
        const secondaryRoot = this.captainRequired(panel, 'AecondToggleNode', node => !!node.getComponent(UITransform));
        const secondaryPopup = this.desc(root, 'SecondaryPopup');
        const title = this.captainRequired(root, 'Title', node => !!node.getComponent(Layout), secondaryPopup ?? undefined);
        const toggles = new Map<number, Toggle>();
        const secondary = new Map<number, Toggle>();
        const headers = new Map<number, Node>();
        for (const column of CAPTAIN_COLUMNS) {
            toggles.set(column.id, this.captainRequired(primary, column.name, node => !!node.getComponent(Toggle)).getComponent(Toggle)!);
            headers.set(column.id, this.captainRequired(title, column.id === 7 ? 'PlayerCent' : column.id === 8 ? 'TeamAllCent' : column.name, node => !!node.getComponent(Label)));
        }
        for (const name of Object.keys(CAPTAIN_SORT_FIELDS) as (keyof typeof CAPTAIN_SORT_FIELDS)[]) {
            const header = this.captainRequired(title, name, node => !!node.getComponent(Button));
            const sort = (): void => {
                if (this.form?.node !== root) return;
                this.captainSortAscending = this.captainSortKey === name ? !this.captainSortAscending : false;
                this.captainSortKey = name;
                this.render(this.captainData);
            };
            header.on(Button.EventType.CLICK, sort, this);
            this.disposers.push(() => { if (header.isValid) header.off(Button.EventType.CLICK, sort, this); });
        }
        for (const column of CAPTAIN_SECOND_COLUMNS) secondary.set(column.id, this.captainRequired(secondaryRoot, column.name, node => !!node.getComponent(Toggle)).getComponent(Toggle)!);
        const popup = this.captainRequired(panel, 'Popup', node => !!node.getComponent(UITransform));
        const closeNodes = [
            this.captainRequired(popup, 'Btn_Close', node => !!node.getComponent(Button)),
            this.captainRequired(panel, 'Btn_Close', node => !!node.getComponent(Button), popup),
        ];
        const sure = this.captainRequired(panel, 'Btn_Sure', node => !!node.getComponent(Button));
        for (const node of closeNodes) {
            const close = (): void => { panel.active = false; this.applyCaptainColumns(root); };
            node.on(Button.EventType.CLICK, close, this);
            this.disposers.push(() => { if (node.isValid) node.off(Button.EventType.CLICK, close, this); });
        }
        const save = (): void => { void this.saveCaptainColumns(root); };
        sure.on(Button.EventType.CLICK, save, this);
        this.disposers.push(() => { if (sure.isValid) sure.off(Button.EventType.CLICK, save, this); });
        this.captainColumns.set(root, { panel, toggles, secondary, headers });
        panel.active = false;
    }
    private applyCaptainColumns(root: Node): void {
        const binding = this.captainColumns.get(root);
        if (!binding) return;
        for (const [id, toggle] of binding.toggles) toggle.isChecked = this.captainShowList.includes(id);
        for (const [id, toggle] of binding.secondary) toggle.isChecked = this.captainShowSecond.includes(id);
        for (const [id, header] of binding.headers) header.active = this.captainShowList.includes(id);
        for (const row of this.captainRows.get(root) ?? []) {
            for (const column of CAPTAIN_COLUMNS) {
                const field = this.desc(row, column.row);
                if (field) field.active = this.captainShowList.includes(column.id);
            }
        }
    }
    private async saveCaptainColumns(root: Node): Promise<void> {
        const binding = this.captainColumns.get(root);
        const form = this.form;
        if (!binding || !form || form.node !== root || Number(this.context.minister ?? 0) !== 2 || this.savingCaptainColumns) return;
        const showList = [...binding.toggles].filter(([, toggle]) => toggle.isChecked).map(([id]) => id);
        const showListSecond = [...binding.secondary].filter(([, toggle]) => toggle.isChecked).map(([id]) => id);
        const request = this.managerRequest;
        this.savingCaptainColumns = true;
        try {
            await this.client.request('club.CClubSavePromotionShowLits', { clubId: this.activeClubId(), showList, showListSecond });
        } catch (error) {
            if (this.form === form && root.isValid) await this.tip(error instanceof Error ? error.message : '保存显示字段失败');
            return;
        } finally { this.savingCaptainColumns = false; }
        if (this.form !== form || !root.isValid || request !== this.managerRequest) return;
        this.captainShowList = showList;
        this.captainShowSecond = showListSecond;
        this.applyCaptainColumns(root);
        this.render(this.captainData);
        binding.panel.active = false;
    }
    private showManager(form: LegacyForm, value: unknown): void {
        this.form = form; this.context = this.value(value); this.type = 0;
        if (this.captainColumns.has(form.node)) {
            this.captainData = [];
            this.captainSortKey = null;
            this.captainSortAscending = false;
            this.captainShowList = CAPTAIN_COLUMNS.map(column => column.id);
            this.captainShowSecond = CAPTAIN_SECOND_COLUMNS.map(column => column.id);
            this.captainColumns.get(form.node)!.panel.active = false;
            this.applyCaptainColumns(form.node);
        }
        const edit = this.desc(form.node, 'searchInput') ? this.desc(this.desc(form.node, 'searchInput')!, 'EditBox')?.getComponent(EditBox) : null; if (edit) edit.string = '';
        const creator = Number(this.context.minister ?? 0) === 2;
        this.active(form.node, 'btn_addPromoter', creator); this.active(form.node, 'btn_setShowData', creator);
        this.active(form.node, 'btn_yaoqing', !creator && Number(this.context.invite ?? 0) !== 0);
        this.updateManagerDates();
        this.updateManagerPeriodState();
        void this.load();
    }

    private selectManagerPeriod(type: number): void {
        if (this.type === type) return;
        this.type = type;
        this.updateManagerPeriodState();
        console.info('[ClubPromotion] manager-period-selected', { clubId: this.clubId(), type });
        void this.load();
    }

    private updateManagerPeriodState(): void {
        const root = this.form?.node; if (!root) return;
        const common = this.desc(root, 'btn_commonOp');
        if (common) { this.active(common, 'on', this.type === -1); this.active(common, 'off', this.type !== -1); }
        for (let index = 0; index <= 6; index += 1) {
            const button = this.desc(root, `btn_tian${index}`); if (!button) continue;
            const toggle = button.getComponent(Toggle); if (toggle) toggle.isChecked = this.type === index;
            this.active(button, 'on', this.type === index);
            this.active(button, 'off', this.type !== index);
        }
    }

    private updateManagerDates(): void {
        const root = this.form?.node; if (!root) return;
        for (let index = 3; index <= 6; index += 1) {
            const button = this.desc(root, `btn_tian${index}`); if (!button) continue;
            const date = new Date(Date.now() - index * 86400000);
            const text = `${date.getMonth() + 1}月${date.getDate()}日`;
            this.label(this.desc(button, 'on') ?? button, 'lb', text);
            this.label(this.desc(button, 'off') ?? button, 'lb', text);
        }
    }

    private async load(): Promise<void> {
        const form = this.form; if (!form) return;
        const searchRoot = this.desc(form.node, 'searchInput'); const query = searchRoot ? this.desc(searchRoot, 'EditBox')?.getComponent(EditBox)?.string.trim() ?? '' : '';
        const protocol = query ? 'club.CClubPromotionLevelIncludeAll' : this.type === -1 ? 'club.CClubPromotionLevelListCommonOp' : 'club.CClubPromotionLevelList';
        const request = ++this.managerRequest;
        let result: PromotionResult;
        try { result = await this.client.request<PromotionResult>(protocol, { clubId: this.clubId(), query, type: this.type }); }
        catch (error: unknown) { if (request === this.managerRequest && this.form === form) await this.tip(error instanceof Error ? error.message : '获取队长列表失败'); return; }
        if (request !== this.managerRequest || this.form !== form || !form.node.isValid) return;
        if (this.captainColumns.has(form.node)) {
            if (Array.isArray(result.showList)) this.captainShowList = result.showList.filter(id => CAPTAIN_COLUMNS.some(column => column.id === id));
            if (Array.isArray(result.showListSecond)) this.captainShowSecond = result.showListSecond.filter(id => CAPTAIN_SECOND_COLUMNS.some(column => column.id === id));
            this.applyCaptainColumns(form.node);
        }
        this.render(result.clubPromotionLevelItemList ?? []);
    }

    private render(rows: PromotionRow[]): void {
        const form = this.form; if (!form) return; const scope = form.node; const content = this.desc(scope, 'content'); const demo = this.desc(scope, 'demo'); if (!content || !demo) return;
        const captain = this.captainNodes.has(scope);
        if (captain) {
            this.captainData = rows.slice();
            const field = this.captainSortKey ? CAPTAIN_SORT_FIELDS[this.captainSortKey] : null;
            if (field && rows.length > 1) {
                const direction = this.captainSortAscending ? 1 : -1;
                const sorted = rows.slice(1).map((row, index) => ({ row, index }));
                sorted.sort((a, b) => direction * (field(a.row) - field(b.row)) || a.index - b.index);
                rows = [rows[0], ...sorted.map(item => item.row)];
            }
        }
        const showsSecondary = (id: number): boolean => !captain || this.captainShowSecond.includes(id);
        this.clearRows(scope); if (!this.captainNodes.has(scope)) for (const child of [...content.children]) if (child !== demo) child.destroy(); demo.active = false;
        console.info('[ClubPromotion] manager-list-render', { clubId: this.clubId(), rowCount: rows.length, selfPid: Number(rows[0]?.pid ?? 0) });
        for (const [index, row] of rows.entries()) { const node = instantiate(demo); if (this.captainNodes.has(scope)) { this.markCaptain(node); const generated = this.captainRows.get(scope) ?? new Set<Node>(); generated.add(node); this.captainRows.set(scope, generated); } node.name = String(row.pid ?? 0); node.active = true;
            this.label(node, 'lb_userName', String(row.name ?? '')); this.label(node, 'lb_userId', `ID:${clubPlayerDisplayId(row)}`); this.label(node, 'lb_playerNum', String(row.number ?? 0));
            this.label(node, 'lb_jushu', String(row.setCount ?? 0));
            if (!this.captainNodes.has(scope)) {
                this.label(node, 'lb_costSp', String(row.entryFee ?? 0));
                this.label(node, 'lb_actualEntryFee', String(row.actualEntryFee ?? 0));
                this.label(node, 'lb_scorePoint', String(row.scorePoint ?? 0));
            }
            this.label(node, 'lb_bili', Number(row.shareType ?? 0) === 1 ? String(row.shareFixedValue ?? 0) : Number(row.shareType ?? 0) === 2 ? '区间' : `${row.shareValue ?? 0}%`); this.label(node, 'lb_curSportPoint', String(row.clubCent ?? row.sportsPoint ?? 0)); this.label(node, 'lb_sumSportPoint', String(row.sumClubCent ?? row.sumSportsPoint ?? 0));
            if (captain) {
                this.label(node, 'lb_record', String(row.sportsPointConsume ?? 0));
                this.label(node, 'lb_bigWinNum', String(row.winner ?? 0));
                // 贡献值沿用原活跃积分的分成收益口径，不使用 actualEntryFee 实际报名费。
                this.label(node, 'lb_contributionCent', String(row.scorePoint ?? 0));
                this.label(node, 'lb_teamWarning', String(row.sportsPointWarning ?? row.clubCentWarning ?? 0));
                this.label(node, 'lb_personalWarning', String(row.personalSportsPointWarning ?? row.personalClubCentWarning ?? 0));
                for (const column of CAPTAIN_COLUMNS) {
                    const field = this.desc(node, column.row);
                    if (field) field.active = this.captainShowList.includes(column.id);
                }
            }
            const control = this.desc(node, 'controlNode'); if (control) control.active = false; const pid = Number(row.pid ?? 0);
            const remarkContext = {
                pid,
                name: row.name,
                onChanged: (remarkName: string) => { if (node.isValid) this.label(node, 'lb_userName', remarkName); },
            };
            this.rowClick(scope, node, 'Avatar', () => { void this.forms.show('UILobbyRemark', remarkContext); });
            this.rowClick(scope, node, 'lb_userName', () => { void this.forms.show('UILobbyRemark', remarkContext); });
            // 服务端队长列表的首行固定为当前用户；显示ID可能与登录身份字段不同，不能只依赖ID判断。
            const isSelf = index === 0 || pid === this.playerId
                || pid === Number(this.context.promotionManagePid ?? 0)
                || pid === Number(this.context.partnerPid ?? 0);
            if (isSelf) {
                this.active(node, 'btn_ShowBtn', false); this.active(node, 'btn_control', false);
                this.setManagerRowExpanded(node, false); content.addChild(node); continue;
            }
            this.rowClick(scope, node, 'btn_ShowBtn', () => this.toggleManagerRow(node)); this.rowClick(scope, node, 'btn_control', () => this.toggleManagerRow(node));
            this.action(scope, control, 'btn_setClubCent', Number(this.context.unionId ?? 0) > 0 && pid !== Number(this.context.pid ?? 0), () => { void this.openSportsPoint(row); });
            this.action(scope, control, 'btn_setPromoter', Number(row.level ?? 0) <= 0, () => { void this.appoint(pid, 0); }); this.action(scope, control, 'btn_cancelPromoter', Number(row.level ?? 0) > 0, () => { void this.confirmAction('取消后该队长下的成员归属将变化，确定取消吗？', () => this.appoint(pid, 1)); });
            this.action(scope, control, 'btn_delPromoter', Number(this.context.minister ?? 0) === 2 && pid !== Number(this.context.promotionManagePid ?? 0), () => { void this.confirmAction('确定移除该队长并踢出俱乐部吗？', () => this.remove(pid)); });
            this.action(scope, control, 'btn_xiaji', Number(row.level ?? 0) > 0, () => { void this.forms.show('ui/club/UIPromoterXiaShuList', { ...this.context, partnerPid: pid }); });
            this.action(scope, control, 'btn_changePromoter', Number(this.context.minister ?? 0) === 2, () => { void this.openChangePromoter(row); });
            this.action(scope, control, 'btn_record', pid !== Number(this.context.pid ?? 0), () => { void this.forms.show('ui/club/UIPromoterRecordUser', { ...this.context, pid, partnerPid: 0 }); });
            this.action(scope, control, 'btn_jjdz', Number(this.context.unionId ?? 0) > 0 && pid !== Number(this.context.pid ?? 0), () => {
                void this.forms.show('ui/club/ClubScoreRecord', { ...this.context, pid });
            });
            this.action(scope, control, 'btn_ClubCentWarning', showsSecondary(1) && Number(this.context.unionId ?? 0) > 0 && Number(row.level ?? 0) > 0, () => { void this.openWarning(row, false); });
            this.action(scope, control, 'btn_spWarningPersonal', showsSecondary(2) && Number(this.context.unionId ?? 0) > 0, () => { void this.openWarning(row, true); });
            this.action(scope, control, 'btn_bmffc', Number(this.context.unionId ?? 0) > 0 && pid !== Number(this.context.pid ?? 0), () => { void this.openShare(row, false); }); this.action(scope, control, 'btn_selfFenCheng', showsSecondary(0) && pid === Number(this.context.pid ?? 0), () => { void this.openShare(row, true); });
            this.action(scope, control, 'btn_baobiao', true, () => { void this.forms.show(Number(this.context.skinType ?? 0) === 2 ? 'ui/club_2/UIPromoterAllReport_2' : 'ui/club/UIPromoterAllReport', { ...this.context, pid }); });
            this.action(scope, control, 'btn_powerOp', Number(this.context.minister ?? 0) === 2, () => { void this.openPower(row); });
            this.action(scope, control, 'btn_Examine', Number(row.examineStatus ?? 0) === 1, () => { void this.confirmAction(`确认审核该队长当前总积分 ${row.totalPoint ?? 0}？`, () => this.examine(row)); });
            content.addChild(node);
        }
        content.getComponent(Layout)?.updateLayout();
    }

    /** 2.22 behavior: only the selected row expands and every sibling row collapses. */
    private toggleManagerRow(row: Node): void {
        const expand = !this.desc(row, 'controlNode')?.active;
        for (const sibling of row.parent?.children ?? []) if (sibling !== row) this.setManagerRowExpanded(sibling, false);
        this.setManagerRowExpanded(row, expand);
        row.parent?.getComponent(Layout)?.updateLayout();
    }

    private setManagerRowExpanded(row: Node, expanded: boolean): void {
        const control = this.desc(row, 'controlNode'); if (!control) return;
        control.active = expanded;
        const transform = row.getComponent(UITransform);
        if (transform) transform.setContentSize(transform.contentSize.width, expanded ? 230 : 80);
    }

    private async openSportsPoint(row: PromotionRow): Promise<void> {
        try {
            const result = await this.client.request<{ sportsPoint?: number; allowSportsPoint?: number }>('club.CClubSubordinateLevelSportsPoint', { clubId: this.clubId(), opPid: Number(row.pid ?? 0) });
            await this.forms.show(Number(this.context.skinType ?? 0) === 2 ? 'ui/club_2/UIUserSetPL_2' : 'ui/club/UIUserSetPL', {
                ...this.context, ...row, pid: Number(row.pid ?? 0), targetPL: Number(result.sportsPoint ?? 0), owerPL: Number(result.allowSportsPoint ?? 0),
                myisminister: 0, targetClubId: this.clubId(), isUnion: false, isPromoter: true, onChanged: () => void this.load(),
            });
        } catch (e) { await this.tip(e instanceof Error ? e.message : '获取队长俱乐部积分失败'); }
    }

    private async openChangePromoter(row: PromotionRow): Promise<void> {
        try {
            const result = await this.client.request<{ player?: { pid?: number; displayId?: number | string; name?: string } }>('club.CClubGetUplevelPromotion', { clubId: this.clubId(), pid: Number(row.pid ?? 0) });
            await this.forms.show(Number(this.context.skinType ?? 0) === 2 ? 'ui/club_2/UIPromoterSet_2' : 'ui/club/ClubPromoterSet', {
                ...this.context, pid: Number(row.pid ?? 0), player: result.player ?? row,
            });
        } catch (e) { await this.tip(e instanceof Error ? e.message : '获取上级队长失败'); }
    }

    private async examine(row: PromotionRow): Promise<void> {
        try {
            await this.client.request('club.CClubSportsPointExamine', { clubId: this.clubId(), value: Number(row.totalPoint ?? 0), opPid: Number(row.pid ?? 0), dateType: this.type });
            await this.tip('审核成功'); await this.load();
        } catch (e) { await this.tip(e instanceof Error ? e.message : '审核失败'); }
    }

    private async appoint(pid: number, type: number): Promise<void> { try { await this.client.request('club.CClubSubordinateLevelAppoint', { clubId: this.clubId(), pid, type }); await this.load(); } catch (e) { await this.tip(e instanceof Error ? e.message : '队长任免失败'); } }
    private async remove(pid: number): Promise<void> { try { await this.client.request('club.CClubSubordinateLevelDelete', { clubId: this.clubId(), pid }); await this.load(); } catch (e) { await this.tip(e instanceof Error ? e.message : '移除队长失败'); } }

    private bindAdd(form: LegacyForm, path: string, level: boolean): void { this.click(form.node, 'btn_close', () => this.forms.close(path)); this.click(form.node, 'btn_search', () => { void this.findAdd(form, level); }); this.click(form.node, 'btn_hehuo_add', () => { void this.commitAdd(path, level); }); this.click(form.node, 'btn_hehuo_yaoqing', () => { void this.commitAdd(path, level); }); }
    private showAdd(form: LegacyForm, value: unknown): void { this.context = this.value(value); this.selectedPid = 0; const edit = this.desc(form.node, 'EditBox')?.getComponent(EditBox); if (edit) edit.string = ''; this.active(form.node, 'user', false); this.active(form.node, 'btn_hehuo_add', false); this.active(form.node, 'btn_hehuo_yaoqing', false); }
    private async findAdd(form: LegacyForm, level: boolean): Promise<void> {
        const text = this.desc(form.node, 'EditBox')?.getComponent(EditBox)?.string.trim() ?? '';
        const clubId = this.clubId();
        if (!/^\d+$/.test(text)) {
            console.warn('[ClubPromotion] add-search-invalid', { clubId, level, inputLength: text.length });
            await this.tip('请输入纯数字的成员ID');
            return;
        }
        const pid = Number(text);
        const protocol = level ? 'club.CClubPromotionLevelPidInfo' : 'club.CClubPromotionPidInfo';
        console.info('[ClubPromotion] add-search-start', { clubId, pid, level, protocol });
        try {
            const result = await this.client.request<{ player?: { pid?: number; displayId?: number | string; name?: string }; sign?: boolean }>(protocol, { clubId, pid });
            this.selectedPid = Number(result.player?.pid ?? 0);
            console.info('[ClubPromotion] add-search-success', { clubId, pid: this.selectedPid, level, sign: Boolean(result.sign) });
            this.active(form.node, 'user', true);
            this.label(form.node, 'name', String(result.player?.name ?? ''));
            this.label(form.node, 'id', `ID:${clubPlayerDisplayId(result.player, this.selectedPid)}`);
            this.active(form.node, result.sign ? 'btn_hehuo_add' : 'btn_hehuo_yaoqing', true);
        } catch (error: unknown) {
            console.error('[ClubPromotion] add-search-failed', { clubId, pid, level, protocol, error });
            await this.tip(error instanceof Error ? error.message : '查找成员失败');
        }
    }
    private async commitAdd(path: string, level: boolean): Promise<void> { if (!this.selectedPid) return; const protocol = level ? 'club.CClubPromotionLevelPidAdd' : 'club.CClubPromotionPidAdd'; try { await this.client.request(protocol, { clubId: this.clubId(), pid: this.selectedPid }); this.forms.close(path); await this.load(); await this.tip('操作成功'); } catch (e) { await this.tip(e instanceof Error ? e.message : '添加队长失败'); } }

    private bindSet(form: LegacyForm, path: string): void { this.click(form.node, 'btn_close', () => this.forms.close(path)); this.click(form.node, 'btn_search', () => { void this.findParent(form); }); this.click(form.node, 'btn_sure', () => { void this.confirmAction('修改从属后原数据归属会发生变化，确定修改吗？', () => this.saveParent(form, path)); }); }
    private showSet(form: LegacyForm, value: unknown): void { this.context = this.value(value); this.setPid = Number(this.context.pid ?? 0); this.searchParentPid = 0; const edit = this.desc(form.node, 'EditBox')?.getComponent(EditBox); if (edit) edit.string = ''; this.label(form.node, 'lb_user', ''); this.label(form.node, 'lb_upname', `${this.context.player?.name ?? ''} (ID:${clubPlayerDisplayId(this.context.player)})`); const toggle = this.desc(form.node, 'toggle2')?.getComponent(Toggle); if (toggle) toggle.isChecked = true; }
    private async findParent(form: LegacyForm): Promise<void> { const query = this.desc(form.node, 'EditBox')?.getComponent(EditBox)?.string.trim() ?? ''; if (!query) { await this.tip('请输入目标归属成员名称或ID'); return; } try { const result = await this.client.request<{ player?: { pid?: number; displayId?: number | string; name?: string } }>('club.CClubPromotionChangeBelongPidInfo', { clubId: this.clubId(), query }); this.searchParentPid = Number(result.player?.pid ?? 0); this.label(form.node, 'lb_user', `${result.player?.name ?? ''} (ID:${clubPlayerDisplayId(result.player, this.searchParentPid)})`); } catch (e) { await this.tip(e instanceof Error ? e.message : '未找到成员'); } }
    private async saveParent(form: LegacyForm, path: string): Promise<void> { const toCreator = Boolean(this.desc(form.node, 'toggle1')?.getComponent(Toggle)?.isChecked); if (!toCreator && !this.searchParentPid) { await this.tip('请搜索归属成员'); return; } try { await this.client.request('club.CClubChangePromotionBelong', { clubId: this.clubId(), pid: this.setPid, upLevelId: toCreator ? 0 : this.searchParentPid, type: toCreator ? 0 : 1 }); this.forms.close(path); await this.load(); await this.tip('修改成功'); } catch (e) { await this.tip(e instanceof Error ? e.message : '从属修改失败'); } }

    private bindSubordinates(form: LegacyForm): void {
        this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIPromoterXiaShuList'));
        this.active(form.node, 'btn_next', false);
        this.active(form.node, 'btn_last', false);
        this.active(form.node, 'page', false);
        const scroll = this.desc(form.node, 'layout')?.parent?.parent?.getComponent(ScrollView);
        if (scroll) this.disposers.push(ScrollEvents.onBottom(scroll, () => {
            if (!this.subordinateLoading) { this.type += 1; void this.loadSubordinates(false); }
        }));
        this.click(form.node, 'btn_search', () => { this.type = 1; void this.loadSubordinates(true); });
        this.click(form.node, 'btn_hehuo_yaoqing', () => { void this.forms.show('ui/club/UIPromoterXIaShuAdd', this.context); });
    }

    private showSubordinates(form: LegacyForm, value: unknown): void {
        this.form = form; this.context = this.value(value); this.type = 1;
        const edit = this.desc(form.node, 'EditBox')?.getComponent(EditBox); if (edit) edit.string = '';
        this.active(form.node, 'btn_hehuo_yaoqing', Number(this.context.minister ?? 0) !== 2);
        void this.loadSubordinates(true);
    }

    private async loadSubordinates(refresh = false): Promise<void> {
        const form = this.form; if (!form || this.subordinateLoading) return; const edit = this.desc(form.node, 'EditBox')?.getComponent(EditBox); const query = edit?.string.trim() ?? '';
        if (query && !/^\d+$/.test(query)) { await this.tip('请输入纯数字的成员ID'); return; }
        this.subordinateLoading = true;
        try {
            const rows = await this.client.request<Array<{ pid?: number; displayId?: number | string; name?: string; curActiveValue?: number }>>('club.CClubSubordinateList', { clubId: this.clubId(), pageNum: this.type, pid: Number(this.context.partnerPid ?? 0), query });
            if (!rows.length && !refresh && this.type > 1) { this.type -= 1; return; }
            const content = this.desc(form.node, 'layout'); const demo = this.desc(form.node, 'hehuo_demo'); if (!content || !demo) return;
            if (refresh) { this.clearRows(form.node); for (const child of [...content.children]) if (child !== demo) child.destroy(); } demo.active = false;
            for (const row of rows) { const node = instantiate(demo); node.name = String(row.pid ?? 0); node.active = true; this.label(node, 'name', String(row.name ?? '')); this.label(node, 'id', `ID:${clubPlayerDisplayId(row)}`); this.label(node, 'lb_active', String(row.curActiveValue ?? 0));
                const pid = Number(row.pid ?? 0); const isOwner = pid === Number(this.context.partnerPid ?? 0); this.active(node, 'btn_hehuo_xiugai', !isOwner);
                this.rowClick(form.node, node, 'btn_hehuo_xiugai', () => { if (Number(this.context.partnerPid ?? 0) === Number(this.context.promotionManagePid ?? -1)) void this.confirmAction('确定删除该下属关系吗？', () => this.removeSubordinate(pid)); else void this.forms.show('ui/club/ClubPromoterSet', { ...this.context, pid, player: row }); });
                this.rowClick(form.node, node, 'btn_hehuo_zhanji', () => { void this.forms.show('ui/club/UIPromoterRecordUser', { ...this.context, pid, partnerPid: this.context.partnerPid }); }); content.addChild(node); }
            content.getComponent(Layout)?.updateLayout();
        } catch (error: unknown) { if (!refresh && this.type > 1) this.type -= 1; await this.tip(error instanceof Error ? error.message : '获取下属列表失败'); }
        finally { this.subordinateLoading = false; }
    }

    private async removeSubordinate(pid: number): Promise<void> { try { await this.client.request('club.CClubPartnerChange', { clubId: this.clubId(), pid, partnerPid: 0 }); this.type = 1; await this.loadSubordinates(true); } catch (e) { await this.tip(e instanceof Error ? e.message : '删除下属失败'); } }

    private bindSubordinateAdd(form: LegacyForm): void { this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIPromoterXIaShuAdd')); this.click(form.node, 'btn_search', () => { void this.findSubordinate(form); }); this.click(form.node, 'btn_yaoqing', () => { void this.addSubordinate(form); }); }
    private showSubordinateAdd(form: LegacyForm, value: unknown): void { this.context = this.value(value); this.selectedPid = 0; const edit = this.desc(form.node, 'EditBox')?.getComponent(EditBox); if (edit) edit.string = ''; this.active(form.node, 'ToggleContainer', Number(this.context.isPromotionManage ?? 0) > 0); this.active(form.node, 'user', false); this.active(form.node, 'btn_yaoqing', false); }
    private async findSubordinate(form: LegacyForm): Promise<void> { const text = this.desc(form.node, 'EditBox')?.getComponent(EditBox)?.string.trim() ?? ''; if (!/^\d+$/.test(text)) { await this.tip('请输入纯数字的成员ID'); return; } try { const result = await this.client.request<{ player?: { pid?: number; name?: string }; type?: number }>('club.CClubSubordinateLevelPidInfo', { clubId: this.clubId(), pid: Number(text) }); this.selectedPid = Number(result.player?.pid ?? 0); this.active(form.node, 'user', true); this.label(form.node, 'name', String(result.player?.name ?? '')); this.label(form.node, 'id', `ID:${this.selectedPid}`); this.active(form.node, 'btn_yaoqing', Number(result.type ?? 0) === 0); if (Number(result.type ?? 0) === 1) await this.tip('该成员已经加入该俱乐部'); else if (Number(result.type ?? 0) === 2) await this.tip('该成员已经绑定队长'); } catch (e) { await this.tip(e instanceof Error ? e.message : '查找成员失败'); } }
    private async addSubordinate(form: LegacyForm): Promise<void> { if (!this.selectedPid) return; const type = this.desc(form.node, 'toggle2')?.getComponent(Toggle)?.isChecked ? 1 : 0; try { await this.client.request('club.CClubSubordinateLevelPidAdd', { clubId: this.clubId(), pid: this.selectedPid, type }); this.forms.close('ui/club/UIPromoterXIaShuAdd'); this.type = 1; await this.loadSubordinates(true); await this.tip('操作成功'); } catch (e) { await this.tip(e instanceof Error ? e.message : '添加下属失败'); } }

    private bindRecords(form: LegacyForm): void {
        this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIPromoterRecordUser'));
        this.click(form.node, 'btn_zhanji_next', () => { if (this.recordPage < this.recordPages) { this.recordPage += 1; void this.loadRecords(); } });
        this.click(form.node, 'btn_zhanji_last', () => { if (this.recordPage > 1) { this.recordPage -= 1; void this.loadRecords(); } });
        this.click(form.node, 'btn_tz', () => { const text = this.desc(form.node, 'pageEditBox')?.getComponent(EditBox)?.string.trim() ?? ''; const page = Number(text); if (Number.isInteger(page) && page > 0 && page <= this.recordPages) { this.recordPage = page; void this.loadRecords(); } });
    }

    private showRecords(form: LegacyForm, value: unknown): void {
        this.recordForm = form; this.recordContext = this.value(value); this.recordPage = 1; this.recordPages = 1;
        const edit = this.desc(form.node, 'pageEditBox')?.getComponent(EditBox); if (edit) edit.string = '';
        void this.loadRecordCount(); void this.loadRecords();
    }

    private recordPacket(): Record<string, number> { return { clubId: Number(this.recordContext.id ?? this.recordContext.clubId ?? 0), partnerPid: Number(this.recordContext.partnerPid ?? 0), pid: Number(this.recordContext.pid ?? 0) }; }
    private async loadRecordCount(): Promise<void> {
        const form = this.recordForm; if (!form) return;
        try {
            const result = await this.client.request<{ pageNumTotal?: number; size?: number; winner?: number; roomCardSize?: number; roomCard?: number; point?: number; player?: { pid?: number; name?: string } }>('club.CClubPromotionPersonalCount', this.recordPacket());
            this.recordPages = Math.max(1, Number(result.pageNumTotal ?? 1)); this.recordPageLabel();
            this.label(form.node, 'lb_cayu', `参与:${result.size ?? 0}场`); this.label(form.node, 'lb_yingjia', `大赢家:${result.winner ?? 0}场`); this.label(form.node, 'lb_fangka', `房卡:${result.roomCardSize ?? 0}场/${result.roomCard ?? 0}张`); this.label(form.node, 'lb_point', String(result.point ?? 0)); this.label(form.node, 'lb_name', String(result.player?.name ?? '')); this.label(form.node, 'lb_id', `ID:${result.player?.pid ?? ''}`);
        } catch (error: unknown) { await this.tip(error instanceof Error ? error.message : '获取推广战绩统计失败'); }
    }

    private async loadRecords(): Promise<void> {
        const form = this.recordForm; if (!form) return;
        const packet: Record<string, number> = { ...this.recordPacket(), pageNum: this.recordPage };
        console.info('[ClubPromotion] record-list-start', { ...packet, protocol: 'club.CClubPromotionPersonalRecord' });
        try {
            const result = await this.client.request<PromotionRecord[] | LegacyListEnvelope<PromotionRecord>>('club.CClubPromotionPersonalRecord', packet);
            const rows = this.listRows(result);
            this.renderRecords(rows); this.recordPageLabel();
            console.info('[ClubPromotion] record-list-success', { clubId: packet.clubId, pid: packet.pid, pageNum: packet.pageNum, rowCount: rows.length });
        } catch (error: unknown) {
            console.warn('[ClubPromotion] record-list-failed', { clubId: packet.clubId, pid: packet.pid, pageNum: packet.pageNum, message: error instanceof Error ? error.message : String(error) });
            await this.tip(error instanceof Error ? error.message : '获取推广战绩失败');
        }
    }

    private renderRecords(rows: PromotionRecord[]): void {
        const form = this.recordForm; if (!form) return; const scope = form.node; const content = this.desc(scope, 'layout'); const demo = this.desc(scope, 'demo'); if (!content || !demo) return;
        this.clearRows(scope); if (!this.captainNodes.has(scope)) for (const child of [...content.children]) if (child !== demo) child.destroy(); demo.active = false;
        rows.forEach((record, index) => { const node = instantiate(demo); node.name = `record${index}`; node.active = true; this.label(node, 'room_key', String(record.roomKey ?? '')); this.label(node, 'lb_gameName', record.configName || `游戏${record.gameType ?? ''}`); this.label(node, 'lb_roomState', Number(record.roomState ?? 0) === 1 ? '游戏中' : ''); this.label(node, 'datetime', Number(record.roomState ?? 0) === 1 ? '' : String(record.endTime ?? '')); const card = Number(record.roomCard ?? 0); this.label(node, 'lb_card', `X${card}`); this.active(node, 'icon_fk', true); this.active(node, 'icon_qk', false); this.active(node, 'icon_ClubCent', false); this.active(node, 'lb_ClubCent', false); this.renderRecordPlayers(node, this.players(record.playerList)); this.rowClick(scope, node, 'btn_record_info', () => this.lobbyNode.emit('legacy-replay-room', { roomId: Number(record.roomID ?? 0), source: 'CLUB', returnForm: 'ui/club/UIClubPromotionRecord' })); content.addChild(node); });
        content.getComponent(Layout)?.updateLayout();
    }

    private renderRecordPlayers(recordNode: Node, players: RecordPlayer[]): void {
        const layout = this.desc(recordNode, 'user_layout'); const demo = this.desc(recordNode, 'userDemo'); if (!layout || !demo) return; demo.active = false;
        for (const player of players) { const node = instantiate(demo); node.active = true; this.label(node, 'lb_name', String(player.name ?? '')); this.label(node, 'lb_id', `ID:${player.pid ?? ''}`); this.label(node, 'lb_code', Number(player.point ?? 0) > 0 ? `+${player.point}` : String(player.point ?? 0)); this.label(node, 'lb_ClubCent', player.clubCent === undefined ? '' : `赛:${Number(player.clubCent) > 0 ? '+' : ''}${player.clubCent}`); layout.addChild(node); }
        layout.getComponent(Layout)?.updateLayout();
    }

    private players(value: PromotionRecord['playerList']): RecordPlayer[] { if (Array.isArray(value)) return value; if (typeof value !== 'string') return []; try { const result = JSON.parse(value) as unknown; return Array.isArray(result) ? result as RecordPlayer[] : []; } catch { return []; } }
    private recordPageLabel(): void { const form = this.recordForm; if (!form) return; this.label(form.node, 'lb_page', `${this.recordPage}/${this.recordPages}`); }

    private bindActive(form: LegacyForm): void { this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIPromoterSetActive')); this.click(form.node, 'btn_sure', () => { void this.saveActive(form); }); this.click(form.node, 'btn_detail', () => { this.forms.close('ui/club/UIPromoterSetActive'); void this.forms.show('ui/club/UIPromoterSetActiveDetail', this.activeContext); }); }
    private showActive(form: LegacyForm, value: unknown): void { this.activeContext = this.value(value) as PromotionContext & PromotionRow; this.rich(form.node, 'lb_TargetActive', `授权${this.activeContext.name ?? ''}（ID:${this.activeContext.pid ?? ''}）活跃计算`); this.label(form.node, 'lb_curActive', `该成员当前活跃计算：${(this.activeContext as PromotionRow & { calcActiveValue?: number }).calcActiveValue ?? 0}`); const edit = this.desc(form.node, 'ActiveEditBox')?.getComponent(EditBox); if (edit) edit.string = ''; }
    private async saveActive(form: LegacyForm): Promise<void> { const value = this.numeric(form, 'ActiveEditBox'); if (value < 0) { await this.tip('请输入大于等于0的纯数字'); return; } try { await this.client.request('club.CClubPromotionCalcActive', { clubId: this.activeClubId(), pid: Number(this.activeContext.pid ?? 0), value }); this.forms.close('ui/club/UIPromoterSetActive'); await this.load(); await this.tip('成功设置该成员活跃计算'); } catch (e) { await this.tip(e instanceof Error ? e.message : '设置活跃计算失败'); } }

    private bindActiveDetail(form: LegacyForm): void { this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIPromoterSetActiveDetail')); this.click(form.node, 'btn_cancel', () => this.forms.close('ui/club/UIPromoterSetActiveDetail')); this.click(form.node, 'btn_save', () => { void this.saveActiveDetail(form); }); }
    private showActiveDetail(form: LegacyForm, value: unknown): void { this.activeForm = form; this.activeContext = this.value(value) as PromotionContext & PromotionRow; this.activePage = 1; this.activeItems = []; void this.loadActiveDetail(true); }
    private async loadActiveDetail(refresh: boolean): Promise<void> { const form = this.activeForm; if (!form) return; try { const rows = await this.client.request<Array<{ configId?: number; configName?: string; gameId?: number; size?: number; value?: number }>>('club.CClubPromotionCalcActiveList', { clubId: this.activeClubId(), pid: Number(this.activeContext.pid ?? 0), pageNum: this.activePage }); const content = this.desc(form.node, 'layout'); const demo = this.desc(form.node, 'demo'); if (!content || !demo) return; if (refresh) { this.clearRows(form.node); this.activeItems = []; for (const child of [...content.children]) if (child !== demo) child.destroy(); } demo.active = false; for (const row of rows) { if (this.activeItems.some((item) => item.configId === row.configId)) continue; this.activeItems.push({ configId: row.configId, value: row.value }); const node = instantiate(demo); node.name = String(row.configId ?? 0); node.active = true; this.label(node, 'lb_roomName', row.configName || `游戏${row.gameId ?? ''}`); this.label(node, 'lb_roomCount', String(row.size ?? 0)); const edit = this.desc(node, 'scorePercentEditBox')?.getComponent(EditBox); if (edit) edit.string = String(row.value ?? 0); content.addChild(node); } content.getComponent(Layout)?.updateLayout(); } catch (e) { await this.tip(e instanceof Error ? e.message : '获取活跃计算明细失败'); } }
    private async saveActiveDetail(form: LegacyForm): Promise<void> { const content = this.desc(form.node, 'layout'); const changed: Array<{ configId: number; value: number }> = []; for (const node of content?.children ?? []) { if (node.name === 'demo') continue; const value = this.numericNode(node, 'scorePercentEditBox'); if (value < 0) { await this.tip('活跃计算值请输入大于等于0的数字'); return; } const configId = Number(node.name); const old = this.activeItems.find((item) => Number(item.configId) === configId); if (Number(old?.value ?? 0) !== value) changed.push({ configId, value }); } if (!changed.length) { await this.tip('没有需要保存的修改'); return; } try { await this.client.request('club.CClubPromotionCalcActiveBatch', { clubId: this.activeClubId(), pid: Number(this.activeContext.pid ?? 0), promotionCalcActiveItemList: changed }); this.forms.close('ui/club/UIPromoterSetActiveDetail'); await this.tip('保存成功'); } catch (e) { await this.tip(e instanceof Error ? e.message : '保存活跃计算失败'); } }

    private bindActiveNum(form: LegacyForm): void { this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIPromoterSetActiveNum')); this.click(form.node, 'btn_Add', () => { void this.changeActiveNum(form, 0); }); this.click(form.node, 'btn_Del', () => { void this.changeActiveNum(form, 1); }); }
    private showActiveNum(form: LegacyForm, value: unknown): void { this.activeContext = this.value(value) as PromotionContext & PromotionRow; this.rich(form.node, 'lb_TargetActive', `因系统异常修改${this.activeContext.name ?? ''}（ID:${this.activeContext.pid ?? ''}）的活跃度`); this.label(form.node, 'lb_curActiveNum', `该成员当前拥有活跃度：${(this.activeContext as PromotionRow & { curActiveValue?: number }).curActiveValue ?? 0}`); const edit = this.desc(form.node, 'ActiveEditBox')?.getComponent(EditBox); if (edit) edit.string = ''; }
    private async changeActiveNum(form: LegacyForm, type: number): Promise<void> { const value = this.numeric(form, 'ActiveEditBox'); const current = Number((this.activeContext as PromotionRow & { curActiveValue?: number }).curActiveValue ?? 0); if (value <= 0 || (type === 1 && value > current)) { await this.tip(type === 1 ? '请输入不大于该成员活跃度的纯数字' : '请输入大于0的纯数字'); return; } try { await this.client.request('club.CClubPromotionActive', { clubId: this.activeClubId(), pid: Number(this.activeContext.pid ?? 0), type, value }); this.forms.close('ui/club/UIPromoterSetActiveNum'); await this.load(); await this.tip('成功设置活跃度'); } catch (e) { await this.tip(e instanceof Error ? e.message : '设置活跃度失败'); } }

    private bindActiveReport(form: LegacyForm): void { this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIPromoterSetActiveReport')); }
    private showActiveReport(form: LegacyForm, value: unknown): void { this.activeForm = form; this.activeContext = this.value(value) as PromotionContext & PromotionRow; void this.loadActiveReport(); }
    private async loadActiveReport(): Promise<void> { const form = this.activeForm; if (!form) return; try { const rows = await this.client.request<Array<{ dateTime?: string; value?: number }>>('club.CClubPromotionActiveReportForm', { clubId: this.activeClubId(), pid: Number(this.activeContext.pid ?? 0) }); const content = this.desc(form.node, 'layout'); const demo = this.desc(form.node, 'demo'); if (!content || !demo) return; this.clearRows(form.node); for (const child of [...content.children]) if (child !== demo) child.destroy(); demo.active = false; for (const row of rows) { const node = instantiate(demo); node.active = true; this.label(node, 'lb_date', String(row.dateTime ?? '')); this.label(node, 'lb_active', String(row.value ?? 0)); content.addChild(node); } content.getComponent(Layout)?.updateLayout(); } catch (e) { await this.tip(e instanceof Error ? e.message : '获取活跃报表失败'); } }

    private activeClubId(): number { return Number(this.activeContext.id ?? this.activeContext.clubId ?? 0); }
    private numeric(form: LegacyForm, name: string): number { return this.numericNode(form.node, name); }
    private numericNode(root: Node, name: string): number { const text = this.desc(root, name)?.getComponent(EditBox)?.string.trim() ?? ''; return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : -1; }
    private rich(root: Node, name: string, value: string): void { const rich = this.desc(root, name)?.getComponent(RichText); if (rich) rich.string = value; else this.label(root, name, value); }

    private bindAllReport(form: LegacyForm, path: string): void { this.click(form.node, 'btn_close', () => this.forms.close(path)); }
    private showAllReport(form: LegacyForm, path: string, value: unknown): void { this.activeForm = form; this.activeContext = this.value(value) as PromotionContext & PromotionRow; void this.loadAllReport(path); }
    private async loadAllReport(path: string): Promise<void> {
        const form = this.activeForm; if (!form) return;
        const packet: Record<string, unknown> = { clubId: this.activeClubId() }; const pid = Number(this.activeContext.pid ?? 0); if (pid > 0) packet.pid = pid;
        console.info('[ClubPromotion] report-list-start', { clubId: packet.clubId, pid: packet.pid ?? 0, protocol: 'club.CClubPromotionLevelReportForm' });
        try {
            const result = await this.client.request<Array<Record<string, unknown>> | LegacyListEnvelope<Record<string, unknown>>>('club.CClubPromotionLevelReportForm', packet);
            const rows = this.listRows(result); const content = this.desc(form.node, 'layout'); const demo = this.desc(form.node, 'demo'); if (!content || !demo) return;
            this.clearRows(form.node); for (const child of [...content.children]) if (child !== demo) child.destroy(); demo.active = false;
            for (const row of rows) { const node = instantiate(demo); node.active = true; this.label(node, 'lb_date', String(row.dateTime ?? '')); this.label(node, 'lb_jushu', String(row.setCount ?? 0)); this.label(node, 'lb_dayingjia', String(row.winner ?? 0)); this.label(node, 'lb_costZuan', String(row.consume ?? 0)); this.label(node, 'lb_sumTable', String(row.table ?? 0)); if (path.includes('club_2')) { this.label(node, 'lb_costSP', String(row.promotionShareValue ?? 0)); this.label(node, 'lb_zhongZhiTotalPoint', String(row.zhongZhiTotalPoint ?? 0)); this.label(node, 'lb_lastSumScore', String(row.zhongZhiFinalTotalPoint ?? 0)); } else { this.label(node, 'lb_costSP', String(row.entryFee ?? 0)); this.label(node, 'lb_winlostSP', String(row.clubCentConsume ?? 0)); this.label(node, 'lb_sumScore', String(row.sumClubCent ?? row.sumSportsPoint ?? 0)); } content.addChild(node); }
            content.getComponent(Layout)?.updateLayout();
            console.info('[ClubPromotion] report-list-success', { clubId: packet.clubId, pid: packet.pid ?? 0, rowCount: rows.length });
        } catch (error: unknown) {
            console.warn('[ClubPromotion] report-list-failed', { clubId: packet.clubId, pid: packet.pid ?? 0, message: error instanceof Error ? error.message : String(error) });
            await this.tip(error instanceof Error ? error.message : '获取推广总报表失败');
        }
    }

    private bindShowSetting(form: LegacyForm, path: string): void {
        // 2.22 Prefab 根节点遗留的全屏 Button 会抢占子 Toggle 的输入命中；该按钮没有业务事件。
        const inheritedRootButton = form.node.getComponent(Button); if (inheritedRootButton) inheritedRootButton.enabled = false;
        this.click(form.node, 'btn_close', () => this.forms.close(path));
        this.click(form.node, 'btn_sure', () => { void this.saveShowSetting(form, path); });
        this.bindShowToggleClicks(this.desc(form.node, 'allToggleNode'));
        this.bindShowToggleClicks(this.desc(form.node, 'secondToggleNode'));
    }
    private showShowSetting(form: LegacyForm, value: unknown): void { const context = this.value(value) as PromotionContext & { promotionShow?: number[]; showList?: number[]; showListSecond?: number[] }; this.activeContext = context; const selected = context.promotionShow ?? context.showList ?? [0, 2, 3, 6, 7, 8, 9, 10, 12]; this.applyToggles(this.desc(form.node, 'allToggleNode'), selected); this.applyToggles(this.desc(form.node, 'secondToggleNode'), context.showListSecond ?? []); }
    private applyToggles(root: Node | null, selected: number[]): void { for (const node of root?.children ?? []) { const index = Number(node.name.replace('toggle_', '')) - 1; const toggle = node.getComponent(Toggle); if (toggle) toggle.isChecked = selected.includes(index); } }
    private toggleValues(root: Node | null): number[] { const values: number[] = []; for (const node of root?.children ?? []) { const index = Number(node.name.replace('toggle_', '')) - 1; if (node.getComponent(Toggle)?.isChecked && index >= 0) values.push(index); } return values; }
    /** Keep the imported layout positions, then enlarge each real Toggle's native hit box. */
    private bindShowToggleClicks(root: Node | null): void {
        const layout = root?.getComponent(Layout);
        layout?.updateLayout();
        if (layout) layout.enabled = false;
        for (const node of root?.children ?? []) {
            const toggle = node.getComponent(Toggle); if (!toggle) continue;
            toggle.enabled = true;
            toggle.interactable = true;
            node.getComponent(UITransform)?.setContentSize(200, 50);
        }
    }
    private async saveShowSetting(form: LegacyForm, path: string): Promise<void> { const showList = this.toggleValues(this.desc(form.node, 'allToggleNode')); if (showList.length > 9) { await this.tip('最多只能勾选9个显示数据'); return; } try { await this.client.request('club.CClubSavePromotionShowLits', { clubId: this.activeClubId(), showList, showListSecond: this.toggleValues(this.desc(form.node, 'secondToggleNode')) }); this.forms.close(path); await this.tip('修改成功，请重新打开队长界面刷新数据'); } catch (e) { await this.tip(e instanceof Error ? e.message : '保存显示字段失败'); } }

    private bindPower(form: LegacyForm): void { this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIPromoterPowerOp')); this.click(form.node, 'btn_sure', () => { void this.savePower(form); }); }
    private showPower(form: LegacyForm, value: unknown): void { const context = this.value(value) as PromotionContext & { kicking?: number; modifyValue?: number; showShare?: number; invite?: number }; this.activeContext = context; this.setChoice(form.node, 'kickingToggleContainer', Number(context.kicking ?? 0)); this.setChoice(form.node, 'modifyValueToggleContainer', Number(context.modifyValue ?? 0)); this.setChoice(form.node, 'showShareToggleContainer', Number(context.showShare ?? 0)); this.setChoice(form.node, 'inviteToggleContainer', Number(context.invite ?? 0)); }
    private setChoice(root: Node, name: string, value: number): void { const container = this.desc(root, name); const yes = container?.children.find((node) => node.name === 'toggle1')?.getComponent(Toggle); const no = container?.children.find((node) => node.name === 'toggle2')?.getComponent(Toggle); if (yes) yes.isChecked = value !== 0; if (no) no.isChecked = value === 0; }
    private choice(root: Node, name: string): number { const container = this.desc(root, name); return container?.children.find((node) => node.name === 'toggle1')?.getComponent(Toggle)?.isChecked ? 1 : 0; }
    private async savePower(form: LegacyForm): Promise<void> { try { await this.client.request('club.CClubPromotionLevelPowerOp', { clubId: this.activeClubId(), pid: Number(this.activeContext.pid ?? 0), kicking: this.choice(form.node, 'kickingToggleContainer'), modifyValue: this.choice(form.node, 'modifyValueToggleContainer'), showShare: this.choice(form.node, 'showShareToggleContainer'), invite: this.choice(form.node, 'inviteToggleContainer') }); this.forms.close('ui/club/UIPromoterPowerOp'); await this.load(); await this.tip('修改成功'); } catch (e) { await this.tip(e instanceof Error ? e.message : '修改推广权限失败'); } }
    private async openPower(row: PromotionRow): Promise<void> { try { const result = await this.client.request<Record<string, unknown>>('club.CClubPromotionLevelPowerInfo', { clubId: this.clubId(), pid: Number(row.pid ?? 0) }); await this.forms.show('ui/club/UIPromoterPowerOp', { ...this.context, ...row, ...result }); } catch (e) { await this.tip(e instanceof Error ? e.message : '获取推广权限失败'); } }

    private async openShare(row: PromotionRow, isSelf: boolean): Promise<void> { const protocol = isSelf ? 'club.CClubPromotionShareInfoSelf' : 'club.CClubPromotionShareInfo'; try { const result = await this.client.request<Record<string, unknown>>(protocol, { clubId: this.clubId(), pid: Number(row.pid ?? 0) }); await this.forms.show(isSelf ? 'ui/club/UIUserSelfBaoMingFei' : 'ui/club/UIUserSetBaoMingFei', { ...this.context, ...row, ...result, isSelf }); } catch (e) { await this.tip(e instanceof Error ? e.message : '获取分成信息失败'); } }
    private bindShare(form: LegacyForm, path: string, isSelf: boolean): void { this.click(form.node, 'btn_close', () => this.forms.close(path)); this.click(form.node, 'btn_sure', () => { if (isSelf) this.forms.close(path); else void this.saveShare(form, path); }); this.click(form.node, 'btn_detail_percent', () => this.openShareDetail(path, 0)); this.click(form.node, 'btn_detail_value', () => this.openShareDetail(path, 1)); this.click(form.node, 'btn_detail_section', () => { this.forms.close(path); void this.forms.show('ui/club/UIUserSetSection', { ...this.shareContext, opClubId: this.clubId(), opPid: this.shareContext.pid, unionFlag: 0 }); }); }
    private showShare(form: LegacyForm, value: unknown, isSelf: boolean): void { this.shareContext = { ...(this.value(value) as PromotionContext & PromotionRow), isSelf } as typeof this.shareContext; const type = Number(this.shareContext.shareType ?? 0); this.rich(form.node, 'lb_TargetPercent', `修改${this.shareContext.name ?? ''}（ID:${this.shareContext.pid ?? ''}）的报名费分成`); this.label(form.node, 'lb_curPercent', `该成员当前报名费分成：${type === 1 ? this.shareContext.shareFixedValue ?? 0 : `${this.shareContext.shareValue ?? 0}%`}`); this.label(form.node, 'lb_maxPercent', `最高:${this.shareContext.doShareValue ?? 0}%,最小:${this.shareContext.minShareValue ?? 0}%`); this.label(form.node, 'lb_maxValue', `最大:${this.shareContext.doShareFixedValue ?? 0},最小:${this.shareContext.minShareFixedValue ?? 0}`); const percent = this.desc(form.node, 'PercentEditBox')?.getComponent(EditBox); const fixed = this.desc(form.node, 'PercentEditBox2')?.getComponent(EditBox); if (percent) percent.string = type === 0 ? String(this.shareContext.shareValue ?? 0) : ''; if (fixed) fixed.string = type === 1 ? String(this.shareContext.shareFixedValue ?? 0) : ''; this.setShareType(form.node, type); }
    private setShareType(root: Node, type: number): void { const container = this.desc(root, 'ToggleContainer'); for (let i = 0; i < 3; i += 1) { const toggle = container?.children.find((node) => node.name === `toggle${i + 1}`)?.getComponent(Toggle); if (toggle) toggle.isChecked = i === type; } }
    private shareType(root: Node): number { const container = this.desc(root, 'ToggleContainer'); if (container?.children.find((node) => node.name === 'toggle2')?.getComponent(Toggle)?.isChecked) return 1; if (container?.children.find((node) => node.name === 'toggle3')?.getComponent(Toggle)?.isChecked) return 2; return 0; }
    private async saveShare(form: LegacyForm, path: string): Promise<void> { const type = this.shareType(form.node); const editName = type === 1 ? 'PercentEditBox2' : 'PercentEditBox'; const value = type === 2 ? 0 : this.numeric(form, editName); const min = type === 1 ? Number(this.shareContext.minShareFixedValue ?? 0) : Number(this.shareContext.minShareValue ?? 0); const max = type === 1 ? Number(this.shareContext.doShareFixedValue ?? 0) : Math.min(100, Number(this.shareContext.doShareValue ?? 100)); if (value < min || value > max) { await this.tip(`输入值需在${min}到${max}之间`); return; } try { await this.client.request('club.CClubPromotionShareChange', { clubId: this.clubId(), pid: Number(this.shareContext.pid ?? 0), value, type }); this.forms.close(path); await this.load(); await this.tip('成功设置报名费分成'); } catch (e) { await this.tip(e instanceof Error ? e.message : '设置分成失败'); } }
    private openShareDetail(path: string, detailType: number): void { this.forms.close(path); void this.forms.show('ui/club/UIUserSetBaoMingFeiDetail', { ...this.shareContext, opClubId: this.clubId(), opPid: this.shareContext.pid, detailType }); }
    private bindShareDetail(form: LegacyForm): void { this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIUserSetBaoMingFeiDetail')); this.click(form.node, 'btn_cancel', () => this.forms.close('ui/club/UIUserSetBaoMingFeiDetail')); this.click(form.node, 'btn_save', () => { void this.saveShareDetail(form); }); this.click(form.node, 'btn_reservedValue', () => { void this.openReserved(form); }); }
    private showShareDetail(form: LegacyForm, value: unknown): void { this.activeForm = form; this.shareContext = this.value(value) as typeof this.shareContext; void this.loadShareDetail(form); }
    private async loadShareDetail(form: LegacyForm): Promise<void> { const type = Number(this.shareContext.detailType ?? 0); const protocol = this.shareContext.isSelf ? 'club.CClubPromotionShareChangeListSelfInfo' : 'club.CClubPromotionShareChangeList'; try { const rows = await this.client.request<Array<Record<string, unknown>>>(protocol, { clubId: this.clubId(), pid: Number(this.shareContext.pid ?? 0), pageNum: 1, type }); const content = this.desc(form.node, 'layout'); const demo = this.desc(form.node, 'demo'); if (!content || !demo) return; this.clearRows(form.node); for (const child of [...content.children]) if (child !== demo) child.destroy(); demo.active = false; for (const row of rows) { const node = instantiate(demo); node.name = String(row.configId ?? 0); node.active = true; this.label(node, 'lb_roomName', String(row.configName ?? '')); this.label(node, 'lb_roomCount', String(row.size ?? 0)); this.label(node, 'lb_allowValue', String(row.allowValue ?? '')); const edit = this.desc(node, 'scorePercentEditBox'); edit && (edit.active = !this.shareContext.isSelf); const box = edit?.getComponent(EditBox); if (box) box.string = String(row.changeFlag ? row.value ?? 0 : type === 1 ? this.shareContext.shareFixedValue ?? 0 : this.shareContext.shareValue ?? 0); content.addChild(node); } content.getComponent(Layout)?.updateLayout(); } catch (e) { await this.tip(e instanceof Error ? e.message : '获取房间分成列表失败'); } }
    private async saveShareDetail(form: LegacyForm): Promise<void> { if (this.shareContext.isSelf) { this.forms.close('ui/club/UIUserSetBaoMingFeiDetail'); return; } const content = this.desc(form.node, 'layout'); const items: Array<{ configId: number; value: number }> = []; for (const node of content?.children ?? []) { if (node.name === 'demo') continue; const value = this.numericNode(node, 'scorePercentEditBox'); if (value < 0) { await this.tip('请输入大于等于0的数字'); return; } items.push({ configId: Number(node.name), value }); } if (!items.length) return; try { await this.client.request('club.CClubPromotionShareChangeBatch', { clubId: this.clubId(), pid: Number(this.shareContext.pid ?? 0), type: Number(this.shareContext.detailType ?? 0), promotionCalcActiveItemList: items }); this.forms.close('ui/club/UIUserSetBaoMingFeiDetail'); await this.tip('保存成功'); } catch (e) { await this.tip(e instanceof Error ? e.message : '保存房间分成失败'); } }
    private shareDetailValues(form: LegacyForm): Array<{ configId: number; value: number }> { const items: Array<{ configId: number; value: number }> = []; for (const node of this.desc(form.node, 'layout')?.children ?? []) { if (node.name === 'demo') continue; const value = this.numericNode(node, 'scorePercentEditBox'); if (value >= 0) items.push({ configId: Number(node.name), value }); } return items; }
    private async openReserved(form: LegacyForm): Promise<void> { try { const result = await this.client.request<Record<string, unknown>>('club.CClubReservedValueInfo', { clubId: this.clubId(), pid: Number(this.shareContext.pid ?? 0) }); await this.forms.show('ui/club/UIUserSetReservedBaoMingFei', { ...this.shareContext, ...result, promotionCalcActiveItemList: this.shareDetailValues(form) }); } catch (e) { await this.tip(e instanceof Error ? e.message : '获取预留值失败'); } }
    private bindReserved(form: LegacyForm): void { this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIUserSetReservedBaoMingFei')); this.click(form.node, 'btn_cancel', () => this.forms.close('ui/club/UIUserSetReservedBaoMingFei')); this.click(form.node, 'btn_sure', () => { void this.saveReserved(form); }); }
    private showReserved(form: LegacyForm, value: unknown): void { this.shareContext = this.value(value) as typeof this.shareContext; this.label(form.node, 'lb_curValue', `当前预留值：${this.shareContext.reservedValue ?? 0}`); const edit = this.desc(form.node, 'ValueEditBox')?.getComponent(EditBox); if (edit) edit.string = String(this.shareContext.reservedValue ?? 0); }
    private async saveReserved(form: LegacyForm): Promise<void> { const value = this.numeric(form, 'ValueEditBox'); if (value < 0) { await this.tip('预留分成值请输入大于等于0的数字'); return; } try { await this.client.request('club.CClubFixedShareChangeMulti', { clubId: this.clubId(), pid: Number(this.shareContext.pid ?? 0), type: Number(this.shareContext.detailType ?? 0), value, promotionCalcActiveItemList: this.shareContext.promotionCalcActiveItemList ?? [] }); this.forms.close('ui/club/UIUserSetReservedBaoMingFei'); this.forms.close('ui/club/UIUserSetBaoMingFeiDetail'); await this.tip('保存成功'); } catch (e) { await this.tip(e instanceof Error ? e.message : '保存预留值失败'); } }

    private bindSection(form: LegacyForm): void { this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIUserSetSection')); this.click(form.node, 'btn_cancel', () => this.forms.close('ui/club/UIUserSetSection')); this.click(form.node, 'btn_save', () => { void this.saveSection(); }); this.click(form.node, 'btn_oneKey', () => { void this.forms.show('ui/club/UIUserChangeSection', { ...this.sectionContext, unionSectionId: -1, shareToSelfValue: this.sectionContext.minAllowShareToValue ?? 0 }); }); }
    private showSection(form: LegacyForm, value: unknown): void { this.activeForm = form; this.sectionContext = this.value(value) as typeof this.sectionContext; this.sectionContext.opClubId = Number(this.sectionContext.opClubId ?? this.clubId()); this.sectionContext.opPid = Number(this.sectionContext.opPid ?? this.shareContext.pid ?? 0); void this.loadSection(); }
    private async loadSection(): Promise<void> { const form = this.activeForm; if (!form) return; try { const result = await this.client.request<{ promotionShareSectionItems?: Array<Record<string, unknown>>; minAllowShareToValue?: number }>('club.CClubPromotionSectionChangeList', { clubId: this.clubId(), opClubId: Number(this.sectionContext.opClubId ?? 0), opPid: Number(this.sectionContext.opPid ?? 0), pageNum: 1, isShowSelf: Boolean(this.sectionContext.isSelf), unionFlag: Number(this.sectionContext.unionFlag ?? 0), unionId: 0 }); this.sectionItems = result.promotionShareSectionItems ?? []; this.sectionContext.minAllowShareToValue = Number(result.minAllowShareToValue ?? 0); this.renderSection(); } catch (e) { await this.tip(e instanceof Error ? e.message : '获取分成区间失败'); } }
    private renderSection(): void { const form = this.activeForm; if (!form) return; const content = this.desc(form.node, 'layout'); const demo = this.desc(form.node, 'demo'); if (!content || !demo) return; this.clearRows(form.node); for (const child of [...content.children]) if (child !== demo) child.destroy(); demo.active = false; this.sectionItems.forEach((row, index) => { const node = instantiate(demo); node.name = String(row.unionSectionId ?? index); node.active = true; const end = Number(row.endValue ?? 0); this.label(node, 'lb_index', String(index + 1)); this.label(node, 'lb_section', `(${row.beginValue ?? 0},${end === -1 ? '∞' : end}]`); this.label(node, 'lb_allowShareToValue', String(row.allowShareToValue ?? 0)); this.label(node, 'lb_shareToSelfValue', String(row.shareToSelfValue ?? 0)); const own = Number(row.shareToSelfValue ?? 0); this.label(node, 'lb_renJunValue', `人均:(${(own / 2).toFixed(2)},${(own / 3).toFixed(2)},${(own / 4).toFixed(2)},${(own / 10).toFixed(2)})`); this.action(form.node, node, 'btn_change', !this.sectionContext.isSelf, () => { void this.forms.show('ui/club/UIUserChangeSection', { ...this.sectionContext, ...row }); }); content.addChild(node); }); content.getComponent(Layout)?.updateLayout(); }
    private async saveSection(): Promise<void> { if (this.sectionContext.isSelf) { this.forms.close('ui/club/UIUserSetSection'); return; } const items = this.sectionItems.map((row) => ({ unionSectionId: Number(row.unionSectionId ?? 0), shareToSelfValue: Number(row.shareToSelfValue ?? 0), beginValue: Number(row.beginValue ?? 0), endValue: Number(row.endValue ?? 0) })); try { await this.client.request('club.CClubPromotionShareSectionChangeBatch', { opClubId: Number(this.sectionContext.opClubId ?? 0), opPid: Number(this.sectionContext.opPid ?? 0), promotionSectionCalcActiveItems: items }); this.forms.close('ui/club/UIUserSetSection'); await this.tip('保存成功'); } catch (e) { await this.tip(e instanceof Error ? e.message : '保存分成区间失败'); } }
    private bindChangeSection(form: LegacyForm): void { this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIUserChangeSection')); this.click(form.node, 'btn_reset', () => this.resetSectionNumber(form)); this.click(form.node, 'btn_save', () => this.commitSectionNumber(form)); void this.attachNumpad(form); }
    private showChangeSection(form: LegacyForm, value: unknown): void { this.sectionContext = { ...this.sectionContext, ...(this.value(value) as typeof this.sectionContext) }; this.active(form.node, 'lb_xiaji', Number(this.sectionContext.unionSectionId ?? 0) !== -1); this.active(form.node, 'lb_xiajiNum', Number(this.sectionContext.unionSectionId ?? 0) !== -1); this.resetSectionNumber(form); }
    private resetSectionNumber(form: LegacyForm): void { const own = Number(this.sectionContext.shareToSelfValue ?? 0); this.label(form.node, 'lb_selfNum', String(own)); this.label(form.node, 'lb_xiajiNum', (Number(this.sectionContext.minAllowShareToValue ?? 0) - own).toFixed(2)); }
    private setSectionNumber(form: LegacyForm, text: string): void { const value = Number(text || 0); const remain = Number(this.sectionContext.minAllowShareToValue ?? 0) - value; if (!Number.isFinite(value) || remain < 0) return; this.label(form.node, 'lb_selfNum', text); this.label(form.node, 'lb_xiajiNum', remain.toFixed(2)); }
    private commitSectionNumber(form: LegacyForm): void { const value = Number(this.desc(form.node, 'lb_selfNum')?.getComponent(Label)?.string ?? 0); const id = Number(this.sectionContext.unionSectionId ?? -1); for (const row of this.sectionItems) if (id === -1 || Number(row.unionSectionId ?? 0) === id) row.shareToSelfValue = value; this.forms.close('ui/club/UIUserChangeSection'); this.renderSection(); }

    private async attachNumpad(form: LegacyForm): Promise<void> {
        this.numpad?.dispose();
        const legacyKeyboard = this.desc(form.node, 'sp_num');
        if (legacyKeyboard) legacyKeyboard.active = false;
        this.numpad = await this.numpadService.open(form.node, () => this.forms.loadCommonNumpad(), {
            close: () => this.forms.close('ui/club/UIUserChangeSection'), confirm: () => this.commitSectionNumber(form),
        }, {
            digitCount: 11,
            maxDigits: 14,
            decimalPlaces: 2,
            value: () => this.desc(form.node, 'lb_selfNum')?.getComponent(Label)?.string ?? '',
            setValue: value => this.setSectionNumber(form, value),
        }, { title: () => form.find('btn_save')?.getComponentInChildren(Label)?.string.trim() || '推广分成' });
    }

    private showPromotionDetail(form: LegacyForm, value: unknown): void { const context = this.value(value) as PromotionContext & { tuiguanglist?: Array<{ pid?: number; name?: string }> }; const content = this.desc(form.node, 'layout'); const demo = this.desc(form.node, 'tuiguang_demo'); if (!content || !demo) return; for (const child of [...content.children]) if (child !== demo) child.destroy(); demo.active = false; (context.tuiguanglist ?? []).forEach((row, index) => { const node = instantiate(demo); node.active = true; this.label(node, 'name', String(row.name ?? '')); this.label(node, 'id', `ID:${row.pid ?? ''}`); this.active(node, 'tip_jiantou', index > 0); content.addChild(node); }); content.getComponent(Layout)?.updateLayout(); }

    private bindPromotionManager(form: LegacyForm): void { this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIPromoterManager')); this.click(form.node, 'btn_PromoterList', () => { void this.forms.show(Number(this.context.skinType ?? 0) === 2 ? 'ui/club_2/UIPromoterAllManager_2' : 'ui/club/ClubCaptain', this.context); }); this.click(form.node, 'btn_PromoterXiaShuList', () => { void this.forms.show('ui/club/UIPromoterXiaShuList', this.context); }); this.click(form.node, 'btn_PromoterMsg', () => { void this.forms.show('ui/club/UIPromoterMsg', this.context); }); }
    private bindPromotionMsg(form: LegacyForm): void { this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIPromoterMsg')); const types: Array<[string, number]> = [['btn_msg_all', 0], ['btn_msg_add', 1], ['btn_msg_del', 2], ['btn_msg_union', 3], ['btn_msg_club', 4], ['btn_msg_xiashu', 5]]; for (const [name, type] of types) this.click(form.node, name, () => { void this.loadPromotionMsg(form, type); }); this.click(form.node, 'btn_search', () => { void this.loadPromotionMsg(form, 0); }); }
    private showPromotionMsg(form: LegacyForm, value: unknown): void { this.activeForm = form; this.activeContext = this.value(value) as PromotionContext & PromotionRow; void this.loadPromotionMsg(form, 0); }
    private async loadPromotionMsg(form: LegacyForm, type: number): Promise<void> { const query = this.desc(form.node, 'execPidEditBox')?.getComponent(EditBox)?.string.trim() ?? ''; try { const rows = await this.client.request<Array<Record<string, unknown>>>('club.CClubPromotionDynamic', { clubId: this.activeClubId(), unionId: Number(this.activeContext.unionId ?? 0), pageNum: 1, type, pid: Number(this.activeContext.partnerPid ?? this.activeContext.pid ?? 0), query }); const content = this.desc(form.node, 'content'); const demo = this.desc(form.node, 'demo'); if (!content || !demo) return; this.clearRows(form.node); for (const child of [...content.children]) if (child !== demo) child.destroy(); demo.active = false; for (const row of rows) { const node = instantiate(demo); node.active = true; this.rich(node, 'lb_message', String(row.message ?? row.msg ?? row.content ?? '')); this.label(node, 'lb_time', String(row.time ?? row.createTime ?? '')); content.addChild(node); } content.getComponent(Layout)?.updateLayout(); } catch (e) { await this.tip(e instanceof Error ? e.message : '获取推广动态失败'); } }

    private async openWarning(row: PromotionRow, personal: boolean): Promise<void> {
        const skin2 = Number(this.context.skinType ?? 0) === 2; const path = skin2 ? 'ui/club_2/UISetClubCentWarning_2' : 'ui/club/UISetClubCentWarning';
        await this.forms.show(path, { ...this.context, ...row, isPersonal: personal, warningScope: personal ? 'personal' : 'branch', clubCentWarning: personal ? row.personalClubCentWarning : row.clubCentWarning });
    }

    private bindWarning(form: LegacyForm, path: string): void { this.click(form.node, 'btn_close', () => this.forms.close(path)); this.click(form.node, 'btn_sure', () => { void this.saveWarning(form, path); }); }
    private showWarning(form: LegacyForm, path: string, value: unknown): void {
        this.warningContext = this.value(value) as PromotionContext & PromotionRow & { isPersonal?: boolean; pidList?: number[] };
        const skin2 = path.includes('club_2'); const personal = Boolean(this.warningContext.isPersonal); const branch = this.warningContext.warningScope === 'branch';
        const tip = skin2 ? personal ? `设置生存积分后，成员【${this.warningContext.name ?? ''}】低于要求将无法游戏` : `设置生存积分后，俱乐部【${this.warningContext.name ?? ''}】低于要求将禁止游戏`
            : personal ? `成员【${this.warningContext.name ?? ''}】俱乐部积分低于预警值将无法游戏` : branch ? '队长分支总俱乐部积分低于预警值时，该分支将禁止游戏' : `俱乐部【${this.warningContext.name ?? ''}】总俱乐部积分低于预警值时将禁止游戏`;
        this.label(form.node, 'lb_tip', tip); const edit = this.desc(form.node, 'PercentEditBox')?.getComponent(EditBox); if (edit) edit.string = String(skin2 ? this.warningContext.alivePoint ?? 0 : this.warningContext.clubCentWarning ?? 0);
        const status = skin2 ? Number(this.warningContext.alivePointStatus ?? 0) : Number(this.warningContext.warnStatus ?? 0); const one = this.desc(form.node, 'toggle1')?.getComponent(Toggle); const two = this.desc(form.node, 'toggle2')?.getComponent(Toggle); if (one) one.isChecked = status !== 0; if (two) two.isChecked = status === 0;
    }

    private async saveWarning(form: LegacyForm, path: string): Promise<void> {
        const value = this.signedNumber(form, 'PercentEditBox'); const skin2 = path.includes('club_2'); if (!Number.isFinite(value) || (skin2 && value > 0)) { await this.tip(skin2 ? '只能输入小于等于0的数字' : '请输入纯数字'); return; }
        const enabled = this.desc(form.node, 'toggle2')?.getComponent(Toggle)?.isChecked ? 0 : 1; const personal = Boolean(this.warningContext.isPersonal); const hasTargetClub = this.warningContext.warningScope === 'club';
        let protocol = personal ? 'club.CClubPersonalClubCentWarningChange' : hasTargetClub ? 'union.CUnionClubCentWarningChange' : 'club.CClubCentWarningChange';
        if (skin2) protocol = personal ? 'club.CClubAlivePointChange' : hasTargetClub ? 'union.CUnionAlivePointChange' : 'club.CClubCentWarningChange';
        const packet: Record<string, unknown> = { clubId: Number(this.warningContext.id ?? this.warningContext.clubId ?? 0), unionId: Number(this.warningContext.unionId ?? 0), pid: Number(this.warningContext.pid ?? 0), value };
        if (hasTargetClub) { packet.opClubId = Number(this.warningContext.opClubId ?? 0); packet.opPid = Number(this.warningContext.createId ?? 0); }
        if (skin2) packet.alivePointStatus = enabled; else packet.warnStatus = enabled;
        try { await this.client.request(protocol, packet); this.forms.close(path); await this.load(); await this.tip(skin2 ? '成功设置生存积分' : '成功设置预警值'); } catch (e) { await this.tip(e instanceof Error ? e.message : skin2 ? '设置生存积分失败' : '设置预警值失败'); }
    }

    private bindEliminate(form: LegacyForm): void { this.click(form.node, 'btn_close', () => this.forms.close('ui/club_2/UIChangeClubCentWarning_2')); this.click(form.node, 'btn_sure', () => { void this.saveEliminate(form); }); }
    private showEliminate(form: LegacyForm, value: unknown): void { this.warningContext = this.value(value) as PromotionContext & PromotionRow & { isPersonal?: boolean; pidList?: number[] }; const batch = Boolean(this.warningContext.pidList?.length); this.label(form.node, 'lb_tip', batch ? `确定修改${this.warningContext.pidList?.length ?? 0}个成员的淘汰分吗？` : `确定修改【${this.warningContext.name ?? ''}(${this.warningContext.pid ?? ''})】的淘汰分吗？`); this.label(form.node, 'lb_taotaifen', String(this.warningContext.eliminatePoint ?? 0)); const edit = this.desc(form.node, 'PercentEditBox')?.getComponent(EditBox); if (edit) edit.string = batch ? '' : String(this.warningContext.eliminatePoint ?? 0); }
    private async saveEliminate(form: LegacyForm): Promise<void> { const value = this.signedNumber(form, 'PercentEditBox'); if (!Number.isFinite(value) || value > 0) { await this.tip('只能输入小于等于0的数字'); return; } const batch = Boolean(this.warningContext.pidList?.length); const protocol = batch ? 'club.CClubEliminatePointChangeMulti' : 'club.CClubEliminatePointChange'; const packet: Record<string, unknown> = { clubId: Number(this.warningContext.id ?? this.warningContext.clubId ?? 0), value }; if (batch) packet.pidList = this.warningContext.pidList; else packet.pid = Number(this.warningContext.pid ?? 0); try { await this.client.request(protocol, packet); this.forms.close('ui/club_2/UIChangeClubCentWarning_2'); await this.load(); await this.tip('成功设置淘汰分'); } catch (e) { await this.tip(e instanceof Error ? e.message : '设置淘汰分失败'); } }
    private signedNumber(form: LegacyForm, name: string): number { const text = this.desc(form.node, name)?.getComponent(EditBox)?.string.trim() ?? ''; return /^-?\d+(?:\.\d+)?$/.test(text) ? Number(text) : Number.NaN; }

    private async confirmAction(message: string, action: () => Promise<void>): Promise<void> { const form = await this.forms.show('UIMessage', null, null, message); if (!form) return; const sure = this.desc(form.node, 'btnSure'); const cancel = this.desc(form.node, 'btnCancel'); if (cancel) { cancel.active = true; cancel.once(Button.EventType.CLICK, () => this.forms.close('UIMessage')); } sure?.once(Button.EventType.CLICK, () => { this.forms.close('UIMessage'); void action(); }); }
    private action(scope: Node, root: Node | null, name: string, active: boolean, fn: () => void): void { const node = root ? this.desc(root, name) : null; if (!node) return; node.active = active; this.rowClick(scope, root!, name, fn); }
    private rowClick(scope: Node, root: Node, name: string, fn: () => void): void {
        const node = this.desc(root, name); if (!node) return;
        const event = this.captainNodes.has(scope) && !node.getComponent(Button) ? Node.EventType.TOUCH_END : Button.EventType.CLICK;
        const listener = () => { if (scope.isValid && root.isValid && node.isValid) fn(); };
        node.on(event, listener);
        const disposers = this.rowDisposers.get(scope) ?? [];
        disposers.push(() => node.off(event, listener)); this.rowDisposers.set(scope, disposers);
    }

    private clearRows(scope?: Node): void {
            const entries = scope ? [[scope, this.rowDisposers.get(scope) ?? []] as const] : [...this.rowDisposers.entries()];
        for (const [owner, disposers] of entries) { for (const dispose of disposers) dispose(); this.rowDisposers.delete(owner); }
    for (const [owner, rows] of this.captainRows) { if (scope && scope !== owner) continue; for (const row of rows) if (row.isValid) row.destroy(); this.captainRows.delete(owner); }
    }
    private value(value: unknown): PromotionContext { return value && typeof value === 'object' ? value as PromotionContext : {}; }
    private listRows<T>(value: T[] | LegacyListEnvelope<T>): T[] {
        if (Array.isArray(value)) return value;
        if (Array.isArray(value.items)) return value.items;
        if (Array.isArray(value.list)) return value.list;
        return [];
    }
    private clubId(): number { return Number(this.context.id ?? this.context.clubId ?? 0); }
    private active(root: Node, name: string, value: boolean): void { const node = this.desc(root, name); if (node) node.active = value; }
    private label(root: Node, name: string, value: string): void {
        setClubDynamicLabel(this.desc(root, name)?.getComponent(Label) ?? null, name, value);
    }
    private click(root: Node, name: string, fn: () => void): void { const node = this.desc(root, name); if (!node) return; const event = this.captainNodes.has(root) && node.getComponent(Toggle) ? Toggle.EventType.TOGGLE : Button.EventType.CLICK; const handler = () => { if (event !== Toggle.EventType.TOGGLE || node.getComponent(Toggle)?.isChecked) fn(); }; node.on(event, handler); this.disposers.push(() => node.off(event, handler)); }
    private markCaptain(root: Node): void {
        if (root.name === 'SecondaryPopup') return;
        this.captainNodes.add(root);
        for (const child of root.children) this.markCaptain(child);
    }
    private desc(root: Node, name: string): Node | null {
        if (!this.captainNodes.has(root)) {
            if (root.name === name) return root;
            for (const child of root.children) { const found = this.desc(child, name); if (found) return found; }
            return null;
        }
        const aliases: Record<string, string> = {
            btn_close: 'Btn_Close', btn_search: 'Btn_Find', btn_addPromoter: 'Btn_AddCaptain',
            btn_yaoqing: 'Btn_InvitePlayer', btn_setShowData: 'Btn_ShowSet', searchInput: 'FindPlay',
            content: 'Content', demo: 'Demo', controlNode: 'Btns', Avatar: 'Head',
            lb_bigWinNum: 'BigWinNum', lb_record: 'Record', lb_contributionCent: 'ContributionCent', lb_teamWarning: 'TeamWarning', lb_personalWarning: 'PlayerWarning', lb_userName: 'Name', lb_userId: 'ID', lb_playerNum: 'PlayerNum', lb_jushu: 'RoomNum',
            lb_bili: 'Commission', lb_curSportPoint: 'ClubCent', lb_sumSportPoint: 'ClubAllCent',
            btn_setClubCent: 'Btn_ModifyCent', btn_xiaji: 'Btn_SubordinatePlayer',
            btn_setPromoter: 'Btn_SetCaptain', btn_record: 'Btn_Record', btn_baobiao: 'Btn_Report',
            btn_delPromoter: 'Btn_Del', btn_cancelPromoter: 'Btn_CancelCaptain', btn_jjdz: 'Btn_Dynamic',
            btn_bmffc: 'Btn_Commission', btn_changePromoter: 'Btn_Belong', btn_powerOp: 'Btn_Permission',
            btn_ClubCentWarning: 'Btn_TeamWarning', btn_spWarningPersonal: 'Btn_PlayerWarning',
            btn_selfFenCheng: 'Btn_MyCommission', btn_Examine: 'Btn_Audit',
            btn_ShowBtn: 'Btn_Show', on: 'YesSelect', off: 'NoSelect', lb: 'Label',
            btn_tian0: 'Btn_Today', btn_tian1: 'Btn_Yesterday', btn_tian2: 'BtnBeforeYesterday',
            btn_tian3: 'Btn_Day_0', btn_tian4: 'Btn_Day_1', btn_tian5: 'Btn_Day_2', btn_tian6: 'Btn_Day_3',
        };
        // These legacy controls are absent from the saved Captain design.
        if (name === 'btn_control' || name === 'btn_commonOp') return null;
        const target = aliases[name] ?? name;
        const matches: Array<{ node: Node; path: string }> = [];
        const visit = (node: Node, path: string): void => {
            if (node.name === 'SecondaryPopup') return;
            const componentMatches = name === 'EditBox' ? !!node.getComponent(EditBox)
                : name.startsWith('lb_') || name === 'lb' ? !!node.getComponent(Label)
                : name.startsWith('btn_tian') ? !!node.getComponent(Toggle)
                : name.startsWith('btn_') ? !!node.getComponent(Button) : !!node.getComponent(UITransform);
            if (node.name === target && componentMatches) matches.push({ node, path });
            for (const [index, child] of node.children.entries()) visit(child, `${path}/${child.name}[${index}]`);
        };
        visit(root, root.name);
        if (matches.length > 1) throw new Error(`[ClubCaptain] ${target} 重名候选：${matches.map(item => item.path).join(', ')}`);
        return matches[0]?.node ?? null;
    }
    private async tip(message: string): Promise<void> { await this.forms.show('UIMessage_Drift', null, null, message); }
}
