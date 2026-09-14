import { Button, Color, HorizontalTextAlignment, Label, Node, Sprite, UITransform, VerticalTextAlignment } from 'cc';
import type { LegacyForm } from '../ui/LegacyFormManager';
import type { AypdkRuntime } from './AypdkRuntime';
import { AypdkGameLogic } from './logic/AypdkGameLogic';
import { AypdkCardRenderer } from './AypdkCardRenderer';
import { LegacyPrefabRenderer } from '../ui/LegacyPrefabRenderer';
import { PlayerAvatarService } from '../../../UI/PlayerAvatarService';

/** Creator 3 binding for the original UIAYPDK_Play prefab and room operations. */
export class AypdkPlayController {
    private form: LegacyForm | null = null;
    private readonly bound = new Set<Node>();
    private readonly cards = new AypdkCardRenderer();
    private readonly prefabs = new LegacyPrefabRenderer();
    private readonly logic: AypdkGameLogic;
    private readonly heads = new Map<number, Node>();
    private readonly remainingCards = new Map<number, number>();
    private readonly headImageUrls = new Map<number, string>();
    private readonly nativeLabels = new Map<string, Label>();
    private clockTimer = 0;
    private tipIndex = 0;
    private activeOpPos = -1;

    public constructor(
        private readonly runtime: AypdkRuntime,
        private readonly requestLeave: (reason: string) => void,
        private readonly showMessage: (message: string) => void,
    ) {
        this.logic = new AypdkGameLogic({
            room: runtime.getRoom(),
            roomSet: runtime.getRoomSet(),
        });
    }

    public onCreate(form: LegacyForm): void {
        this.form = form;
        this.ensureSettingsAction('btn_bjl/btn_jiesan', '解散房间');
        this.ensureSettingsAction('btn_bjl/btn_gps', '定位');
        this.active('btn_bjl/btn_jiesan', false);
        this.active('btn_bjl/btn_gps', false);
        this.bind('btn_list/btn_ready', () => this.ready());
        this.bind('btn_list/btn_cancel', () => this.unready());
        this.bind('btn_list/btn_go', () => this.start());
        this.bind('gameBtn/btn_pass', () => this.pass());
        this.bind('gameBtn/btn_tip', () => this.tip());
        this.bind('gameBtn/btn_outCard', () => this.outCard());
        this.bind('gameMultiple/btn_1', () => this.addDouble(0));
        this.bind('gameMultiple/btn_2', () => this.addDouble(1));
        this.bind('gameMultiple/btn_3', () => this.addDouble(2));
        this.bind('gameMultiple/btn_5', () => this.addDouble(5));
        this.bind('btn_robDoor', () => this.robClose(1));
        this.bind('btn_notRobDoor', () => this.robClose(0));
        this.bind('btn_openCard', () => this.openCard());
        this.bind('btn_bjl/btn_jiesan', () => this.exitOrDissolve());
        this.bind('btn_shezhi', () => this.toggleSettings());
        this.bind('btn_jipaiqi', () => this.toggle('jpq'));
        this.bind('btn_bjl/btn_gps', () => this.toggle('gps'));
    }

    public onShow(): void {
        this.refresh();
        void this.renderHeads();
        void this.refreshHand();
        const setInfo = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        this.activeOpPos = Number(setInfo.opPos ?? -1);
        this.restoreTableCardData(setInfo);
        if (Number(setInfo.lastOpPos ?? -1) >= 0 && Array.isArray(setInfo.cardList)) {
            void this.showLastOperation({ pos: setInfo.lastOpPos, cardList: setInfo.cardList });
        }
    }

    public onEvent(event: string, body: unknown): void {
        if (!this.form) return;
        if (event === 'AYPDKSetStart') {
            this.logic.InitHandCard();
            this.initializeRemainingCards();
            void this.refreshHand();
            const start = body as any;
            const setInfo = start.setInfo ?? start;
            this.activeOpPos = Number(setInfo.opPos ?? -1);
            this.startClock(this.activeOpPos, Number(setInfo.runWaitSec ?? start.runWaitSec ?? 0));
        }
        if (event === 'OpCard') {
            const operation = body as Record<string, unknown>;
            if (Boolean(operation.turnEnd)) this.logic.ClearCardData();
            this.logic.SetCardData(Number(operation.opCardType ?? operation.opType ?? 0), Array.isArray(operation.cardList) ? operation.cardList : []);
            this.tipIndex = 0;
            void this.showLastOperation(operation);
            if (Number(operation.pos ?? operation.opPos) === this.clientPos() && Array.isArray(operation.privateList)) {
                this.logic.OutPokerCard(operation.privateList);
                void this.refreshHand();
            }
            const dataPos = Number(operation.pos ?? operation.opPos);
            const privateList = Array.isArray(operation.privateList) ? operation.privateList : null;
            const previous = this.remainingCards.get(dataPos) ?? 0;
            this.remainingCards.set(dataPos, privateList ? privateList.length : Math.max(0, previous - (operation.cardList as any[] ?? []).length));
        }
        if (event === 'ChangeStatus') {
            this.hideOutCards();
            const status = body as any;
            this.activeOpPos = Number(status.opPos ?? -1);
            this.restoreTableCardData(status);
            this.startClock(this.activeOpPos, Number(status.runWaitSec ?? 0));
        }
        if (event === 'AYPDKSetEnd') this.showMessage('本局结束');
        if (event === 'RoomEnd') this.showMessage('房间牌局结束');
        if (event === 'AYPDK_DissolveRoom') {
            this.showMessage((body as any)?.ownnerForce ? '房主解散了房间' : '房间已解散');
            this.requestLeave('aypdk-room-dissolved');
        }
        this.refresh();
        this.refreshHeads();
    }

    public destroy(): void {
        this.stopClock();
        this.form = null;
        this.bound.clear();
        this.heads.clear();
        this.remainingCards.clear();
        this.headImageUrls.clear();
        this.nativeLabels.clear();
        this.activeOpPos = -1;
    }

    private refresh(): void {
        const room = this.runtime.getRoom();
        const pos = this.runtime.getRoomPosManager();
        const set = this.runtime.getRoomSet();
        const cfg = room.GetRoomConfig() ?? {};
        const state = Number(room.GetRoomProperty('state') ?? 0);
        const setId = Number(room.GetRoomProperty('setID') ?? 0);
        const setCount = Number(cfg.setCount ?? 0);
        this.text('roomInfo/labelRoomId', `房间号：${room.GetRoomProperty('key') ?? ''}`);
        this.text('roomInfo/lb_jushu', `局数：${setId}/${setCount}`);
        this.text('roomInfo/labelBSF', cfg.clubId || cfg.unionId ? '俱乐部房间' : '好友房');

        const players = pos.GetRoomAllPlayerInfo() ?? {};
        const clientPos = pos.GetClientPos();
        const client = players[clientPos];
        const full = Object.keys(players).filter((key) => Number(players[key]?.pid) > 0).length >= Number(cfg.playerNum ?? 3);
        this.active('btn_list/btn_ready', state === 0 && full && !Boolean(client?.roomReady));
        this.active('btn_list/btn_cancel', state === 0 && Boolean(client?.roomReady));
        this.active('btn_list/btn_go', state === 0 && full && room.IsClientIsOwner());
        this.active('btn_list/btn_weixin', state === 0 && !full);

        const setInfo = set.GetRoomSetInfo() ?? {};
        const modelOpPos = Number(setInfo.opPos ?? -1);
        if (this.activeOpPos < 0 && modelOpPos >= 0) this.activeOpPos = modelOpPos;
        const playing = state === 1 && this.activeOpPos === clientPos;
        this.active('gameBtn', playing);
        this.active('gameBtn/btn_pass', playing && !Boolean(setInfo.isFirstOp));
        this.active('gameBtn/btn_tip', playing && !Boolean(setInfo.isFirstOp) && Number(setInfo.opType ?? 0) > 0);
        this.active('gameBtn/btn_outCard', playing);
        this.active('gameMultiple', false);
        this.active('btn_robDoor', false);
        this.active('btn_notRobDoor', false);
        this.active('btn_openCard', false);

        for (let dataPos = 0; dataPos < Number(pos.GetRoomPlayerCount()); dataPos += 1) {
            const uiPos = Number(pos.GetUIPosByDataPos(dataPos));
            const player = players[dataPos];
            this.active(`sp_seat0${uiPos}`, Boolean(player?.pid));
            const count = this.remainingCards.get(dataPos) ?? Number(player?.cardNum ?? player?.handCardCount ?? 0);
            this.text(`sp_seat0${uiPos}/cardNum`, count > 0 ? `${count}张` : '');
            this.active(`sp_seat0${uiPos}/card`, uiPos !== 0 && count > 0 && Boolean(room.GetRoomWanfa(1)));
        }
    }

    private ready(): void {
        const roomId = this.roomId();
        this.runtime.getRoomManager().SendReady(roomId, this.clientPos());
    }

    private unready(): void {
        this.runtime.getRoomManager().SendUnReady(this.roomId(), this.clientPos());
    }

    private start(): void {
        this.runtime.getRoomManager().SendStartRoomGame(this.roomId());
    }

    private pass(): void {
        this.runtime.getRoomManager().SendOpCard({ roomID: this.roomId(), pos: this.clientPos(), opCardType: 1, cardList: [] });
    }

    private tip(): void {
        const tips = this.logic.GetTipCard();
        if (!tips.length) { this.showMessage('没有可出的牌'); return; }
        if (this.tipIndex >= tips.length) this.tipIndex = 0;
        this.logic.ChangeSelectCard(tips[this.tipIndex]);
        this.tipIndex += 1;
        this.updateCardSelection();
    }

    private outCard(): void {
        const opCardType = Number(this.logic.GetCardType());
        if (opCardType <= 0) { this.showMessage('当前选牌不能出'); return; }
        const cardList = [...this.logic.GetSelectCard()];
        this.logic.TransformValueToS(cardList);
        this.runtime.getRoomManager().SendOpCard({
            roomID: this.roomId(), pos: this.clientPos(), opCardType, cardList, daiNum: this.logic.GetDaiNum(),
        });
    }

    private addDouble(value: number): void {
        this.runtime.getRoomManager().SendAddDouble(this.roomId(), this.clientPos(), value);
    }

    private robClose(value: number): void {
        this.runtime.getRoomManager().SendRoobDoor(this.roomId(), this.clientPos(), value);
    }

    private openCard(): void {
        this.runtime.getRoomManager().SendOpenCard(this.roomId(), this.clientPos(), 1);
    }

    private exitOrDissolve(): void {
        const room = this.runtime.getRoom();
        const state = Number(room.GetRoomProperty('state') ?? 0);
        if (state === 1 || room.IsClientIsOwner()) {
            this.runtime.getRoomManager().SendDissolveRoom(this.roomId());
            return;
        }
        this.runtime.getRoomManager().SendExitRoom(this.roomId(), this.clientPos());
    }

    private toggleSettings(): void {
        const dissolve = this.node('btn_bjl/btn_jiesan');
        const gps = this.node('btn_bjl/btn_gps');
        const visible = !(dissolve?.active || gps?.active);
        if (dissolve) dissolve.active = visible;
        if (gps) gps.active = visible;
    }

    private async showLastOperation(body: Record<string, unknown>): Promise<void> {
        const pos = Number(body.pos ?? body.opPos ?? -1);
        if (pos < 0) return;
        const uiPos = Number(this.runtime.getRoomPosManager().GetUIPosByDataPos(pos));
        const cards = Array.isArray(body.cardList) ? body.cardList.map(Number) : [];
        this.active(`sp_seat0${uiPos}/pass`, cards.length === 0);
        const parent = this.node(`outCardList${uiPos}`);
        if (!parent) return;
        parent.removeAllChildren();
        parent.active = cards.length > 0;
        for (const card of cards) await this.cards.create(card, parent, false);
    }

    private hideOutCards(): void {
        for (let uiPos = 0; uiPos < 3; uiPos += 1) {
            const outCards = this.node(`outCardList${uiPos}`);
            if (outCards) { outCards.removeAllChildren(); outCards.active = false; }
            this.active(`sp_seat0${uiPos}/pass`, false);
        }
    }

    private initializeRemainingCards(): void {
        const info = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        for (const item of info.posInfo ?? []) {
            const values = item.surplusCardList ?? item.cards;
            if (Array.isArray(values)) this.remainingCards.set(Number(item.posID ?? item.pos), values.length);
        }
        const own = this.logic.GetHandCard();
        if (own?.length) this.remainingCards.set(this.clientPos(), own.length);
    }

    private async renderHeads(): Promise<void> {
        if (!this.form) return;
        const manifest = await this.prefabs.loadManifest('legacy-ui/forms/aypdk/game/AYPDK/UIPublicHeadAYPDK.manifest');
        const manager = this.runtime.getRoomPosManager();
        const players = manager.GetRoomAllPlayerInfo() ?? {};
        for (const key of Object.keys(players)) {
            const dataPos = Number(key);
            const uiPos = Number(manager.GetUIPosByDataPos(dataPos));
            const parent = this.node(`sp_seat0${uiPos}/head`);
            if (!parent || this.heads.has(dataPos)) continue;
            parent.removeAllChildren();
            const head = await this.prefabs.instantiate(manifest, parent);
            head.name = `UIPublicHeadAYPDK${uiPos}`;
            head.setScale(1.2, 1.2, 1);
            this.hideHeadCommunication(head);
            this.heads.set(dataPos, head);
        }
        this.refreshHeads();
    }

    private refreshHeads(): void {
        const players = this.runtime.getRoomPosManager().GetRoomAllPlayerInfo() ?? {};
        for (const [dataPos, head] of this.heads) {
            const player = players[dataPos];
            head.active = Boolean(player?.pid);
            if (!player?.pid) continue;
            this.headText(head, 'touxiang/sp_info/lb_name', String(player.name ?? ''));
            this.headText(head, 'touxiang/sp_info/lb_jifen', String(player.point ?? 0));
            this.headActive(head, 'touxiang', true);
            this.headActive(head, 'icon_ready', Number(this.runtime.getRoom().GetRoomProperty('state') ?? 0) === 0
                && Boolean(player.roomReady || player.gameReady));
            this.headActive(head, 'icon_auto', Boolean(player.trusteeship));
            this.headActive(head, 'touxiang/mask/sp_lixian', Boolean(player.isLostConnect));
            this.updateHeadImage(dataPos, head, Number(player.pid), String(player.headImageUrl ?? ''));
        }
    }

    private updateHeadImage(dataPos: number, head: Node, playerId: number, url: string): void {
        const resolvedUrl = PlayerAvatarService.url(playerId, url);
        if (!resolvedUrl || this.headImageUrls.get(dataPos) === resolvedUrl) return;
        this.headImageUrls.set(dataPos, resolvedUrl);
        void PlayerAvatarService.frame(playerId, url).then((frame) => {
            if (!head.isValid || this.headImageUrls.get(dataPos) !== resolvedUrl) return;
            const sprite = this.headNode(head, 'touxiang/mask/btn_head')?.getComponent(Sprite);
            if (sprite) sprite.spriteFrame = frame;
        }).catch(() => undefined);
    }

    private startClock(dataPos: number, runWaitSec = 0, seconds = 30): void {
        this.stopClock();
        for (let uiPos = 0; uiPos < 3; uiPos += 1) this.active(`sp_seat0${uiPos}/clock`, false);
        if (dataPos < 0) return;
        const uiPos = Number(this.runtime.getRoomPosManager().GetUIPosByDataPos(dataPos));
        const clock = this.node(`sp_seat0${uiPos}/clock`);
        const label = clock?.getChildByName('num')?.getComponent(Label);
        if (!clock || !label) return;
        let left = seconds - runWaitSec;
        if (left < 0) return;
        clock.active = true;
        label.string = String(left);
        this.clockTimer = globalThis.setInterval(() => {
            left -= 1;
            if (!clock.isValid || left <= 0) { this.stopClock(); if (clock.isValid) clock.active = false; return; }
            label.string = String(left);
        }, 1000);
    }

    private stopClock(): void {
        if (this.clockTimer) globalThis.clearInterval(this.clockTimer);
        this.clockTimer = 0;
    }

    private headNode(root: Node, path: string): Node | null { return root.getChildByPath(path) ?? null; }
    private headActive(root: Node, path: string, value: boolean): void { const node = this.headNode(root, path); if (node) node.active = value; }
    private headText(root: Node, path: string, value: string): void { const label = this.headNode(root, path)?.getComponent(Label); if (label) label.string = value; }
    private hideHeadCommunication(head: Node): void {
        for (const name of [
            'sp_chatdi_left', 'sp_chatdi_right', 'sp_chatdi_leftBottom', 'sp_chatdi_rightBottom',
            'sp_audio_left', 'sp_audio_right',
        ]) this.headActive(head, name, false);
    }

    private async refreshHand(): Promise<void> {
        const parent = this.node('handCards');
        if (!parent) return;
        let hand = this.logic.GetHandCard();
        if (!hand?.length) {
            try { this.logic.InitHandCard(); hand = this.logic.GetHandCard(); } catch { hand = []; }
        }
        parent.removeAllChildren();
        for (let index = 0; index < hand.length; index += 1) {
            const card = hand[index];
            if (card === undefined) continue;
            const node = await this.cards.create(card, parent, this.logic.CheckSelected(card));
            node.name = String(index);
            node.on(Node.EventType.TOUCH_END, () => {
                const legacyCardIndex = index + 1;
                if (this.logic.CheckSelected(card)) this.logic.DeleteCardSelected(legacyCardIndex);
                else this.logic.SetCardSelected(legacyCardIndex);
                this.updateCardSelection();
            }, this);
        }
    }

    private restoreTableCardData(source: any): void {
        if (!source) return;
        if (Boolean(source.turnEnd) || Boolean(source.isFirstOp)) {
            this.logic.ClearCardData();
            this.tipIndex = 0;
            return;
        }
        const cards = Array.isArray(source.cardList) ? source.cardList : [];
        this.logic.SetCardData(Number(source.opCardType ?? source.opType ?? 0), cards);
    }

    private updateCardSelection(): void {
        const parent = this.node('handCards');
        const hand = this.logic.GetHandCard();
        if (!parent) return;
        for (let index = 0; index < parent.children.length; index += 1) {
            const child = parent.children[index];
            const card = hand[index];
            if (!child || card === undefined) continue;
            this.cards.setSelected(child, this.logic.CheckSelected(card));
        }
    }

    private roomId(): number { return Number(this.runtime.getRoomManager().GetEnterRoomID()); }
    private clientPos(): number { return Number(this.runtime.getRoomPosManager().GetClientPos()); }
    private node(path: string): Node | null { return this.form?.find(path) ?? null; }
    private active(path: string, value: boolean): void { const node = this.node(path); if (node) node.active = value; }
    private text(path: string, value: string): void {
        let label = this.nativeLabels.get(path);
        if (!label) {
            const host = this.node(path);
            const migrated = host?.getComponent(Label);
            const transform = host?.getComponent(UITransform);
            if (!host || !migrated || !transform) return;
            migrated.enabled = false;
            const node = new Node('__creator3_label');
            const childTransform = node.addComponent(UITransform);
            childTransform.setContentSize(transform.contentSize);
            const fresh = node.addComponent(Label);
            fresh.fontSize = migrated.fontSize;
            fresh.lineHeight = migrated.lineHeight;
            fresh.horizontalAlign = migrated.horizontalAlign;
            fresh.verticalAlign = migrated.verticalAlign;
            fresh.overflow = migrated.overflow;
            fresh.color = migrated.color.clone();
            fresh.fontFamily = 'Arial';
            host.addChild(node);
            label = fresh;
            this.nativeLabels.set(path, label);
        }
        label.string = value;
    }
    private toggle(path: string): void { const node = this.node(path); if (node) node.active = !node.active; }
    private ensureSettingsAction(path: string, text: string): void {
        const node = this.node(path);
        if (!node) return;
        const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
        transform.setContentSize(132, 48);
        if (!node.getComponent(Button)) node.addComponent(Button);
        let labelNode = node.getChildByName('__creator3_action_label');
        if (!labelNode) {
            labelNode = new Node('__creator3_action_label');
            labelNode.layer = node.layer;
            labelNode.addComponent(UITransform).setContentSize(132, 48);
            const label = labelNode.addComponent(Label);
            label.fontSize = 24;
            label.lineHeight = 30;
            label.horizontalAlign = HorizontalTextAlignment.CENTER;
            label.verticalAlign = VerticalTextAlignment.CENTER;
            label.color = new Color(255, 255, 255, 255);
            node.addChild(labelNode);
        }
        labelNode.getComponent(Label)!.string = text;
    }
    private bind(path: string, callback: () => void): void {
        const node = this.node(path);
        if (!node || this.bound.has(node)) return;
        this.bound.add(node);
        let lastFire = 0;
        const invoke = (): void => {
            const now = Date.now();
            if (now - lastFire < 180) return;
            lastFire = now;
            callback();
        };
        node.on(Button.EventType.CLICK, invoke, this);
        node.on(Node.EventType.TOUCH_END, invoke, this);
        node.on(Node.EventType.MOUSE_UP, invoke, this);
    }
}
