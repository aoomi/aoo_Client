import { Button, instantiate, isValid, Label, Node, UITransform } from 'cc';
import type { LegacyForm } from '../../../../../../Common/Code/Runtime/ui/LegacyFormManager';
import type { CommonPdkRuntime } from './CommonPdkRuntime';
import type { CommonPdkShareController } from './CommonPdkShareController';

export class CommonPdkRecordController {
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
        this.text('BestWinnerPanel/BestWinnerHead/NickNameBackground/BestWinnerNameLabel', String(bestPlayer?.name ?? ''));
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
            this.text(`${root}/Head/NickNameBackground/PlayerNameLabel`, String(player.name ?? ''));
            this.text(`${root}/Statistics/WinCount/WinCountLabel`, String(info.winCount ?? 0));
            this.text(`${root}/Statistics/LoseCount/LoseCountLabel`, String(info.loseCount ?? 0));
            this.active(`${root}/TotalScore/TotalWinScoreLabel`, point > 0);
            this.active(`${root}/TotalScore/TotalLoseScoreLabel`, point <= 0);
            this.text(`${root}/TotalScore/TotalWinScoreLabel`, point > 0 ? `+${point}` : '');
            this.text(`${root}/TotalScore/TotalLoseScoreLabel`, point <= 0 ? String(point) : '');
        }
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
