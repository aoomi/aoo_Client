import { Button, Label, Node, RichText, Toggle, sys } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';

interface RankItem { rankingId?: number; prizeType?: number; value?: number }

export class LegacyUnionInfoPopupController {
    private readonly disposers: Array<() => void> = [];
    private readonly unionTipIds = new WeakMap<Node, string>();
    public constructor(private readonly forms: LegacyFormManager, private readonly client: ProtocolClient) {}
    public install(): void {
        this.forms.register('ui/club/UIUnionRoomCfgMsg', { zOrder: 12, lifecycle: { onCreate: (form) => this.bindRoom(form), onShow: (form, wanfa, unionCfg) => this.showRoom(form, wanfa, unionCfg) }});
        this.forms.register('ui/club/UIUnionRankTip', { zOrder: 12, lifecycle: { onCreate: (form) => this.bindRank(form), onShow: (form, unionName, item, context) => this.showRank(form, unionName, item, context) }});
        this.forms.register('ui/club/UIUnionTip', { zOrder: 12, lifecycle: { onCreate: (form) => this.bindUnionTip(form), onShow: (form, unionId, unionName, ownerClubName, clubName) => this.showUnionTip(form, unionId, unionName, ownerClubName, clubName) }});
    }
    public dispose(): void { for (const dispose of this.disposers.splice(0)) dispose(); }

    private bindRoom(form: LegacyForm): void { this.click(form.node, 'btnSure', () => this.forms.close('ui/club/UIUnionRoomCfgMsg')); }
    private showRoom(form: LegacyForm, wanfa: unknown, unionCfg: unknown): void { this.label(form.node, 'wanfa_1', String(wanfa ?? '')); this.label(form.node, 'wanfa_2', String(unionCfg ?? '')); }
    private bindRank(form: LegacyForm): void { this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIUnionRankTip')); }
    private bindUnionTip(form: LegacyForm): void {
        this.click(form.node, 'btn_close', () => {
            const unionId = this.unionTipIds.get(form.node) ?? '';
            const checked = this.desc(form.node, 'NoTipToggle')?.getComponent(Toggle)?.isChecked === true;
            if (unionId) sys.localStorage.setItem(`${unionId}_NoTipUnion`, checked ? '1' : '0');
            this.forms.close('ui/club/UIUnionTip');
        });
    }
    private showUnionTip(form: LegacyForm, unionId: unknown, unionName: unknown, ownerClubName: unknown, clubName: unknown): void {
        const id = String(unionId ?? '');
        this.unionTipIds.set(form.node, id);
        const toggle = this.desc(form.node, 'NoTipToggle')?.getComponent(Toggle);
        if (toggle) toggle.isChecked = Number(sys.localStorage.getItem(`${id}_NoTipUnion`) ?? 0) === 1;
        this.label(form.node, 'lb_unionName', String(ownerClubName ?? ''));
        this.label(form.node, 'lb_clubName', String(clubName ?? ''));
        this.label(form.node, 'lb_title', `当前俱乐部管理已将俱乐部加入“${String(unionName ?? '')}”联盟`);
    }
    private showRank(form: LegacyForm, unionName: unknown, value: unknown, context: unknown): void {
        const item = value && typeof value === 'object' ? value as RankItem : null;
        const name = String(unionName ?? '').slice(0, 8);
        this.rich(form.node, 'lb_unionName', `<color=#705d52>您所参与的</color><color=#53a632>${name}</color><color=#705d52>，已开始新一轮的比赛</color>`);
        const ranked = Number(item?.rankingId ?? 0) > 0;
        this.rich(form.node, 'lb_rank', ranked ? `<color=#705d52>您在上一轮的比赛排名：</color><color=#e76b20>${item?.rankingId}</color>` : '<color=#705d52>您在上一轮的比赛排名：</color><color=#e76b20>未上榜</color>');
        this.label(form.node, 'lb_reward', ranked ? '恭喜您获得' : '');
        this.label(form.node, 'lb_rewardNum', ranked && Number(item?.prizeType ?? 0) > 0 ? `x${item?.value ?? 0}` : '');
        this.active(form.node, 'img_ld', ranked && Number(item?.prizeType ?? 0) === 1);
        this.active(form.node, 'img_zs', ranked && Number(item?.prizeType ?? 0) === 2);
        const packet = context && typeof context === 'object' ? context as Record<string, unknown> : {};
        void this.client.request('union.CUnionGetRankingInfo', packet).catch(() => undefined);
    }

    private click(root: Node, name: string, action: () => void): void { const node = this.desc(root, name); if (!node) return; const handler = () => action(); node.on(Button.EventType.CLICK, handler); this.disposers.push(() => node.off(Button.EventType.CLICK, handler)); }
    private desc(root: Node, name: string): Node | null { if (root.name === name) return root; for (const child of root.children) { const found = this.desc(child, name); if (found) return found; } return null; }
    private label(root: Node, name: string, value: string): void { const label = this.desc(root, name)?.getComponent(Label); if (label) label.string = value; }
    private rich(root: Node, name: string, value: string): void { const rich = this.desc(root, name)?.getComponent(RichText); if (rich) rich.string = value; }
    private active(root: Node, name: string, value: boolean): void { const node = this.desc(root, name); if (node) node.active = value; }
}
