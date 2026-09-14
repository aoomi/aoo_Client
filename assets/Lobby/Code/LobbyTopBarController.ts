import { Button, Label, Node } from 'cc';
import { LegacyForm, LegacyFormManager } from '../../Common/Code/Runtime/ui/LegacyFormManager';

export interface LegacyTopBarPlayer {
    playerId: number;
    name: string;
    roomCard: number;
    diamond: number;
    clubCard: number;
    gold?: number;
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
                onShow: (_form, formPath, showClubCard) => this.show(String(formPath ?? ''), Boolean(showClubCard)),
                onDestroy: () => this.dispose(),
            },
        });
    }

    public async push(formPath: string, showClubCard = false): Promise<void> {
        await this.forms.show('UITop', formPath, showClubCard);
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

    public getDiamond(): number {
        return this.player.diamond;
    }

    public setDiamond(value: number): void {
        this.player.diamond = value;
        this.setRoomCard(value);
    }

    public setClubCard(value: number): void {
        this.player.clubCard = value;
        this.setLabel('img_syright_up/bgcreate/rightTop/quanka/label', String(value));
    }

    public getClubCard(): number {
        return this.player.clubCard;
    }

    public setGold(value: number): void {
        this.player.gold = value;
    }

    public getGold(): number {
        return Number(this.player.gold ?? 0);
    }

    private bind(form: LegacyForm): void {
        this.form = form;
        this.onClick(form.find('img_syright_up/bgcreate/btn_close'), () => this.closeTop());
    }

    private show(formPath: string, showClubCard: boolean): void {
        if (formPath && this.closeStack.indexOf(formPath) === -1) this.closeStack.push(formPath);
        this.setLabel('img_syright_up/bgcreate/userinfo/label_name', this.player.name);
        this.setLabel('img_syright_up/bgcreate/userinfo/label_id', `ID:${this.player.playerId}`);
        this.setLabel('img_syright_up/bgcreate/rightTop/fangka/label', String(this.player.roomCard));
        this.setLabel('img_syright_up/bgcreate/rightTop/quanka/label', String(this.player.clubCard));
        const right = this.form?.find('img_syright_up/bgcreate/rightTop');
        const gold = right?.getChildByName('ledou');
        const club = right?.getChildByName('quanka');
        const room = right?.getChildByName('fangka');
        if (gold) gold.active = false;
        if (club) club.active = showClubCard;
        if (room) room.active = true;
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
