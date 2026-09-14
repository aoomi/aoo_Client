import { Button, Label, Node, UITransform } from 'cc';
import type { NoticeItem } from '../../../../Common/Code/Runtime/Social/SocialGateway';
import type { LegacyForm, LegacyFormManager } from '../../../../Common/Code/Runtime/ui/LegacyFormManager';

export class NoticeController {
    private form: LegacyForm | null = null;
    private items: readonly NoticeItem[] = [];
    private readonly update = (value: unknown): void => { this.items = (value as { items?: readonly NoticeItem[] } | undefined)?.items ?? []; this.render(); };
    public constructor(private readonly forms: LegacyFormManager, private readonly lobby: Node) { lobby.on('legacy-notices-updated', this.update); }
    public async open(): Promise<void> { this.form = await this.forms.show('UILobbyNotice'); if (!this.form) return; this.form.find('Popup/Tag/Close')?.once(Button.EventType.CLICK, () => this.forms.closeAfterPointer('UILobbyNotice')); this.render(); }
    public destroy(): void { if (this.lobby.isValid) this.lobby.off('legacy-notices-updated', this.update); }
    private render(): void { if (!this.form) return; const content = this.form.find('Affiche/Content'), empty = this.form.find('Affiche/Content/Empty'); if (empty) empty.active = this.items.length === 0; if (!content) return; for (const child of [...content.children]) if (child.name.startsWith('NoticeItem')) child.destroy(); this.items.slice(0, 8).forEach((item, index) => { const row = new Node(`NoticeItem${index + 1}`); row.addComponent(UITransform).setContentSize(650, 52); const label = row.addComponent(Label); label.string = `${item.title}  ${item.content}`; label.fontSize = 22; label.lineHeight = 28; label.overflow = Label.Overflow.SHRINK; row.setPosition(0, 155 - index * 55); content.addChild(row); }); }
}
