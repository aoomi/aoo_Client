import { Button, instantiate, isValid, Label, Node, Prefab, UITransform, Vec3 } from 'cc';
import { AssetLoader } from '../../../../../../Common/Code/UI/Infrastructure';
import { CommonHeadController } from '../../../../../../Common/Code/UI/CommonHeadController';
import type { LegacyForm } from '../../../../../../Common/Code/Runtime/ui/LegacyFormManager';
import { COMMON_ASSET_BUNDLE, COMMON_HEAD_ASSET } from '../../../../../../Common/Code/Runtime/ui/CommonPrefabRegistry';
import type { CommonPdkRuntime } from './CommonPdkRuntime';
import type { CommonPdkShareController } from './CommonPdkShareController';

export class CommonPdkRecordController {
    private readonly assets = new AssetLoader();
    private readonly headRevisions = new WeakMap<Node, number>();
    private form: LegacyForm | null = null;
    private terminalPayload: Record<string, unknown> = {};
    private continuing = false;
    // Final settlement is already terminal at game authority. Skipping a second
    // in-game leave command lets Hall clear the completed room deterministically.
    private readonly returnLobby = (): void => this.requestLeave('authority-left');
    private readonly continueMatch = (): void => { void this.continueRoom(); };
    private readonly shareMore = (): void => this.openShare();
    private readonly showDetails = (): void => this.shareController.shareLink();
    private readonly buttonDisposers: Array<() => void> = [];

    public constructor(
        private readonly runtime: CommonPdkRuntime,
        private readonly requestLeave: (reason: string) => void,
        private readonly showMessage: (message: string) => void,
        private readonly shareController: CommonPdkShareController,
        private readonly openShare: () => void,
        private readonly closeSettlement: () => void,
    ) {}

    public onCreate(form: LegacyForm): void {
        this.form = form;
        this.bindButtons();
        this.logRuntimeBinding(form);
    }

    public onShow(form?: LegacyForm, roomEnd?: unknown): void {
        if (form) this.form = form;
        this.terminalPayload = this.record(roomEnd);
        this.bindButtons();
        this.render();
    }
    public destroy(): void { this.unbindButtons(); this.form = null; }

    private bindButtons(): void {
        this.unbindButtons();
        this.bindButton('BottomBar/NormalActions/Btn_ReturnLobby', this.returnLobby);
        this.bindButton('BottomBar/FinishedActions/Btn_ReturnLobby', this.returnLobby);
        this.bindButton('BottomBar/NormalActions/Btn_Continue', this.continueMatch);
        this.bindButton('BottomBar/NormalActions/Btn_ShareMore', this.shareMore);
        this.bindButton('BottomBar/FinishedActions/Btn_Details', this.showDetails);
    }

    private unbindButtons(): void {
        for (const dispose of this.buttonDisposers.splice(0)) dispose();
    }

    private bindButton(path: string, callback: () => void): void {
        const node = this.node(path);
        if (!node) return;
        node.on(Button.EventType.CLICK, callback, this);
        this.buttonDisposers.push(() => {
            if (isValid(node, true) && (node as unknown as { _eventProcessor?: unknown })._eventProcessor) {
                node.off(Button.EventType.CLICK, callback, this);
            }
        });
    }

    private render(): void {
        const room = this.runtime.getRoom();
        const cachedRoomEnd = this.record(room.GetRoomProperty('roomEnd'));
        const payload = Object.keys(this.terminalPayload).length > 0 ? this.terminalPayload : cachedRoomEnd;
        const nestedRecord = this.record(payload.record);
        const record = Object.keys(nestedRecord).length > 0 ? nestedRecord : payload;
        const playersByPos = this.runtime.getRoomPosManager().GetRoomAllPlayerInfo() ?? {};
        const players = Object.keys(playersByPos).map((key) => playersByPos[key]).sort((a, b) => Number(a.pos) - Number(b.pos));
        const infos = Array.isArray(record.recordPosInfosList) ? record.recordPosInfosList : [];
        const maxPoint = infos.reduce((max: number, item: any) => Math.max(max, Number(item?.point ?? 0)), Number.NEGATIVE_INFINITY);
        this.text('TopBar/RoomIdLabel', `房间号:${record.roomKey ?? room.GetRoomProperty('key') ?? ''}`);
        this.text('TopBar/RoundCountLabel', `局数:${record.setCnt ?? room.GetRoomProperty('setID') ?? 0}`);
        this.text('TopBar/EndTimeLabel', `结束时间：${this.date(record.endSec)}`);
        this.active('BottomBar/NormalActions', true);
        this.active('BottomBar/FinishedActions', false);
        const bestIndex = infos.findIndex((item: any) => Number(item?.point ?? 0) === maxPoint);
        const bestPlayer = bestIndex >= 0 ? players[bestIndex] : undefined;
        const bestHead = this.node('BestWinnerPanel/BestWinnerHead');
        if (bestHead) bestHead.active = Boolean(bestPlayer);
        if (bestHead && bestPlayer) void this.renderPlayerHead(bestHead, bestPlayer, '大赢家');
        this.text('BestWinnerPanel/BestWinnerScoreLabel', Number.isFinite(maxPoint)
            ? (maxPoint > 0 ? `+${maxPoint}` : String(maxPoint)) : '');
        // FinalSettlement is only opened after the authority marks the match finished.
        // Every seated player may vote for an in-place rematch, regardless of room origin.
        this.active('BottomBar/NormalActions/Btn_Continue', true);
        this.text('BottomBar/NormalActions/Btn_Continue/ContinueLabel', '继续游戏');
        const content = this.node('PlayerList/PlayerListView/PlayerListContent');
        const template = this.node('PlayerList/PlayerListView/PlayerListContent/PlayerItemTemplate');
        const itemAt = (index: number): Node | null => {
            if (!content || !template) return null;
            if (index === 0) return template;
            const name = `PlayerItem${index + 1}`;
            let item = content.getChildByName(name);
            if (!item) {
                item = instantiate(template);
                item.name = name;
                content.addChild(item);
            }
            return item;
        };
        for (let index = 0; index < 4; index += 1) {
            const item = itemAt(index);
            const player = players[index];
            const info = infos[index] ?? {};
            if (item) item.active = Boolean(player);
            if (!player) continue;
            const root = item ? this.pathOf(item) : '';
            const point = Number(info.point ?? 0);
            const headMount = item?.getChildByName('Head');
            if (!headMount) throw new Error(`BigSettlement 玩家条目缺少 Head 挂点: ${index}`);
            void this.renderPlayerHead(headMount, player, `玩家列表${index}`);
            this.text(`${root}/Statistics/WinCount/WinCountLabel`, String(info.winCount ?? 0));
            this.text(`${root}/Statistics/LoseCount/LoseCountLabel`, String(info.loseCount ?? 0));
            this.active(`${root}/TotalScore/TotalWinScoreLabel`, point > 0);
            this.active(`${root}/TotalScore/TotalLoseScoreLabel`, point <= 0);
            this.text(`${root}/TotalScore/TotalWinScoreLabel`, point > 0 ? `+${point}` : '');
            this.text(`${root}/TotalScore/TotalLoseScoreLabel`, point <= 0 ? String(point) : '');
        }
    }

    /** 大结算与小结算共用 CommonHead/List，禁止再维护独立头像遮罩和地址加载链路。 */
    private async renderPlayerHead(mount: Node, player: Record<string, unknown>, source: string): Promise<void> {
        const revision = (this.headRevisions.get(mount) ?? 0) + 1;
        this.headRevisions.set(mount, revision);
        let head = mount.getChildByName('CommonHead');
        if (!head?.isValid) {
            const bundle = await this.assets.bundle(COMMON_ASSET_BUNDLE);
            const prefab = await this.assets.load(COMMON_HEAD_ASSET, Prefab, bundle);
            if (!mount.isValid || this.headRevisions.get(mount) !== revision) return;
            head = instantiate(prefab);
            for (const child of [...mount.children]) child.destroy();
            mount.addChild(head);
        }
        const controller = head.getComponent(CommonHeadController);
        if (!controller) throw new Error('CommonHead 缺少 CommonHeadController');
        const listVariant = controller.useVariant('List');
        const mountSize = mount.getComponent(UITransform)?.contentSize;
        const variantSize = listVariant.getComponent(UITransform)?.contentSize;
        const scale = mountSize && variantSize && variantSize.width > 0 && variantSize.height > 0
            ? Math.min(mountSize.width / variantSize.width, mountSize.height / variantSize.height)
            : 1;
        head.setScale(new Vec3(scale, scale, 1));
        head.setPosition(-listVariant.position.x * scale, -listVariant.position.y * scale, 0);
        this.textAt(head, 'List/Lb_PlayerName', String(player.name ?? player.nickName ?? ''));
        this.activeAt(head, 'List/Icon_Banker', Number(player.pid) === Number(this.runtime.getRoom().GetRoomProperty('ownerID')));
        await controller.showPlayerAvatar(Number(player.pid ?? 0), String(player.headImageUrl ?? ''));
        console.info('[PDK BigSettlement head]', {
            roomId: Number(this.runtime.getRoomManager().GetEnterRoomID()),
            playerId: Number(player.pid ?? 0), source,
        });
    }

    private async continueRoom(): Promise<void> {
        if (this.continuing) return;
        this.continuing = true;
        const button = this.node('BottomBar/NormalActions/Btn_Continue')?.getComponent(Button);
        if (button) button.interactable = false;
        try {
            const roomId = Number(this.runtime.getRoomManager().GetEnterRoomID());
            await this.runtime.action('rematch', 'common.room.rematch_req', { roomID: roomId });
            // Closing by changing node.active leaves LegacyFormManager's shown
            // stack and full-screen modal input mask alive. Always close through
            // the manager so the resumed room becomes interactive immediately.
            this.closeSettlement();
        } catch (error: any) {
            this.showMessage(error?.message ?? '无法继续游戏，请联系赛事举办方');
        } finally {
            this.continuing = false;
            if (button?.isValid) button.interactable = true;
        }
    }

    private date(value: unknown): string {
        const raw = Number(value ?? Date.now());
        const date = new Date(raw < 100000000000 ? raw * 1000 : raw);
        const pad = (number: number) => number < 10 ? `0${number}` : String(number);
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    private node(path: string): Node | null {
        return this.form?.find(path) ?? this.form?.find(`FinalSettlementPanel/${path}`) ?? null;
    }
    private record(value: unknown): Record<string, any> {
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value as Record<string, any> : {};
    }
    private logRuntimeBinding(form: LegacyForm): void {
        const prefab = (form.node as unknown as { _prefab?: { asset?: { uuid?: string } } })._prefab?.asset;
        const details = ['BottomBar/NormalActions/Btn_ReturnLobby', 'BottomBar/NormalActions/Btn_Continue'].map(path => {
            const node = this.node(path);
            const transform = node?.getComponent(UITransform);
            const button = node?.getComponent(Button);
            return { path: node ? `${form.node.name}/FinalSettlementPanel/${path}` : path, found: Boolean(node),
                interactable: button?.interactable ?? false, active: node?.activeInHierarchy ?? false,
                hitArea: transform?.getBoundingBoxToWorld() ?? null };
        });
        console.info('[PDK BigSettlement binding]', JSON.stringify({
            bundle: 'poker-common', asset: 'Prefab/BigSettlement_0', uuid: prefab?.uuid ?? '',
            instanceRoot: form.node.name, details,
        }));
    }
    private active(path: string, value: boolean): void { const node = this.node(path); if (node) node.active = value; }
    private text(path: string, value: string): void { const label = this.node(path)?.getComponent(Label); if (label) label.string = value; }
    private activeAt(root: Node, path: string, value: boolean): void {
        const node = root.getChildByPath(path);
        if (node) node.active = value;
    }
    private textAt(root: Node, path: string, value: string): void {
        const label = root.getChildByPath(path)?.getComponent(Label);
        if (label) label.string = value;
    }
    private pathOf(node: Node): string {
        const names: string[] = [];
        let current: Node | null = node;
        while (current && current !== this.form?.node) {
            names.unshift(current.name);
            current = current.parent;
        }
        return names.join('/');
    }
}
