import { Button, Label, Node } from 'cc';
import { LegacyForm, LegacyFormManager } from '../../Common/Code/Runtime/ui/LegacyFormManager';

export interface LegacyTopBarPlayer {
    playerId: number;
    name: string;
    roomCard: number;
    gold: number;
}

export class LobbyTopBarController {
    private readonly closeStack: string[] = [];
    private readonly disposers: Array<() => void> = [];
    private form: LegacyForm | null = null;

    public constructor(
        private readonly forms: LegacyFormManager,
        private readonly player: LegacyTopBarPlayer,
    ) {}

    public install(): void {
        this.forms.register('UITop', {
            zOrder: 13,
            modal: false,
            lifecycle: {
                onCreate: (form) => this.bind(form),
                onShow: (_form, formPath) => this.show(String(formPath ?? '')),
                onDestroy: () => this.dispose(),
            },
        });
    }

    public async push(formPath: string): Promise<void> {
        await this.forms.show('UITop', formPath);
    }

    public remove(formPath: string): void {
        const index = this.closeStack.lastIndexOf(formPath);
        if (index >= 0) this.closeStack.splice(index, 1);
    }

    public pop(formPath: string): void {
        this.remove(formPath);
        if (this.closeStack.length === 0) this.forms.close('UITop');
    }

    public setRoomCard(value: number): void {
        this.player.roomCard = value;
        this.setLabel('img_syright_up/bgcreate/rightTop/fangka/label', String(value));
    }

    public getRoomCard(): number {
        return this.player.roomCard;
    }

    public setGold(value: number): void {
        this.player.gold = value;
        this.setLabel('img_syright_up/bgcreate/rightTop/ledou/label', String(value));
    }

    public getGold(): number {
        return Number(this.player.gold ?? 0);
    }

    private bind(form: LegacyForm): void {
        this.form = form;
        this.onClick(form.find('img_syright_up/bgcreate/btn_close'), () => this.closeTop());
    }

    private show(formPath: string): void {
        if (formPath && this.closeStack.indexOf(formPath) === -1) this.closeStack.push(formPath);
        this.setLabel('img_syright_up/bgcreate/userinfo/label_name', this.player.name);
        this.setLabel('img_syright_up/bgcreate/userinfo/label_id', `ID:${this.player.playerId}`);
        this.setLabel('img_syright_up/bgcreate/rightTop/fangka/label', String(this.player.roomCard));
        this.setLabel('img_syright_up/bgcreate/rightTop/ledou/label', String(this.player.gold));
        const gold = this.form?.find('img_syright_up/bgcreate/rightTop/ledou');
        if (gold) gold.active = true;
    }

    private closeTop(): void {
        const target = this.closeStack.pop();
        if (target) this.forms.close(target);
        if (this.closeStack.length === 0) this.forms.close('UITop');
    }

    private setLabel(path: string, value: string): void {
        const label = Label ? this.form?.find(path)?.getComponent(Label) : null;
        if (label) label.string = value;
    }

    private onClick(node: Node | null, listener: () => void): void {
        if (!node || !Button) return;
        node.on(Button.EventType.CLICK, listener);
        let disposed = false;
        this.disposers.push(() => {
            if (disposed) return;
            disposed = true;
            if (!node.isValid) return;
            node.off(Button.EventType.CLICK, listener);
        });
    }

    private dispose(): void {
        for (const dispose of this.disposers.splice(0)) dispose();
        this.closeStack.length = 0;
        this.form = null;
    }
}
