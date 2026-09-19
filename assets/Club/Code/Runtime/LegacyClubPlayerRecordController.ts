import { Button, JsonAsset, Label, Layout, Node, instantiate, resources } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { populateAuthoritativeGameNames } from '../../../Games/Common/Code/Catalog/CatalogFamilyBindings';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { setClubDynamicLabel } from './ClubDynamicLabel';

interface PlayerRecordRow { gameId?: number; size?: number; winner?: number; sumPoint?: number }

export class LegacyClubPlayerRecordController {
    private form: LegacyForm | null = null;
    private clubId = 0;
    private unionId = 0;
    private type = 0;
    private readonly gameNames = new Map<number, string>();
    private readonly disposers: Array<() => void> = [];

    public constructor(private readonly forms: LegacyFormManager, private readonly client: ProtocolClient) {}

    public install(): void {
        this.forms.register('ui/club/ClubPlayerLog', { zOrder: 10, lifecycle: {
            onCreate: (form) => this.bind(form),
            onShow: (form, clubId, unionId) => this.show(form, Number(clubId ?? 0), Number(unionId ?? 0)),
            onClose: () => { this.form = null; },
        }});
        populateAuthoritativeGameNames(this.gameNames);
    }

    public dispose(): void { for (const dispose of this.disposers.splice(0)) dispose(); }
    private bind(form: LegacyForm): void { this.click(form.node, 'btn_close', () => this.forms.close('ui/club/ClubPlayerLog')); for (let i = 0; i <= 6; i += 1) this.click(form.node, `btn_tian${i}`, () => { this.type = i; this.updateTabs(); void this.load(); }); }
    private show(form: LegacyForm, clubId: number, unionId: number): void { this.form = form; this.clubId = clubId; this.unionId = unionId; this.type = 0; this.label(form.node, 'tip_shuying', unionId > 0 ? '俱乐部积分' : '输赢分'); this.updateDates(); this.updateTabs(); void this.load(); }
    private async load(): Promise<void> { const form = this.form; if (!form) return; try { const [rows, count] = await Promise.all([this.client.request<PlayerRecordRow[]>('club.CClubPlayerRecord', { clubId: this.clubId, unionId: this.unionId, getType: this.type }), this.client.request<{ size?: number; winner?: number; sumPoint?: number }>('club.CClubPlayerRecordCount', { clubId: this.clubId, unionId: this.unionId, getType: this.type })]); this.render(rows); this.label(form.node, 'lb_jushu', `对局数：${count.size ?? 0}`); this.label(form.node, 'lb_dayingjia', `大赢家：${count.winner ?? 0}`); this.label(form.node, 'lb_shuyingfen', `${this.unionId > 0 ? '俱乐部积分' : '输赢分'}：${count.sumPoint ?? 0}`); } catch (e) { this.render([]); await this.tip(e instanceof Error ? e.message : '获取战绩统计失败'); } }
    private render(rows: PlayerRecordRow[]): void { const form = this.form; if (!form) return; const content = this.desc(form.node, 'layout'); const demo = this.desc(form.node, 'demo'); if (!content || !demo) return; for (const child of [...content.children]) child.destroy(); demo.active = false; rows.forEach((row, index) => { const node = instantiate(demo); node.active = true; this.active(node, 'bg', index % 2 === 0); this.label(node, 'lb_game', this.gameNames.get(Number(row.gameId ?? 0)) ?? `游戏${row.gameId ?? ''}`); this.label(node, 'lb_shuyingfen', String(row.sumPoint ?? 0)); this.label(node, 'lb_jushu', String(row.size ?? 0)); this.label(node, 'lb_dayingjia', String(row.winner ?? 0)); content.addChild(node); }); content.getComponent(Layout)?.updateLayout(); }
    private updateTabs(): void { const tab = this.form ? this.desc(this.form.node, 'tab') : null; for (let i = 0; i < (tab?.children.length ?? 0); i += 1) { const child = tab?.children[i]; if (!child) continue; this.active(child, 'on', i === this.type); this.active(child, 'off', i !== this.type); } }
    private updateDates(): void { const tab = this.form ? this.desc(this.form.node, 'tab') : null; for (let i = 3; i < (tab?.children.length ?? 0); i += 1) { const child = tab?.children[i]; if (!child) continue; const date = new Date(Date.now() - i * 86400000); const text = `${date.getMonth() + 1}月${date.getDate()}日`; this.label(this.desc(child, 'on') ?? child, 'lb', text); this.label(this.desc(child, 'off') ?? child, 'lb', text); } }
    private click(root: Node, name: string, fn: () => void): void { const node = this.desc(root, name); if (!node) return; node.on(Button.EventType.CLICK, fn); this.disposers.push(() => node.off(Button.EventType.CLICK, fn)); }
    private desc(root: Node, name: string): Node | null { if (root.name === name) return root; for (const child of root.children) { const result = this.desc(child, name); if (result) return result; } return null; }
    private label(root: Node, name: string, value: string): void { setClubDynamicLabel(this.desc(root, name)?.getComponent(Label) ?? null, name, value); }
    private active(root: Node, name: string, value: boolean): void { const node = this.desc(root, name); if (node) node.active = value; }
    private async tip(message: string): Promise<void> { await this.forms.show('UIMessage_Drift', null, null, message); }
}
