import { Button, instantiate, Label, Node, UITransform, Vec3 } from 'cc';
import { ZjhActions, ZjhRoomView } from './ZjhRoomPresenter';
import { ZjhSeatState, ZjhSnapshot } from './ZjhRoomState';
import type { ZjhSettlementResult } from './ZjhProtocol';

export type ZjhRoomAction = 'start' | 'look' | 'bet' | 'preBet' | 'fold' | 'compare' | 'continue';
export interface ZjhRoomActionSink {
    invoke(action: ZjhRoomAction): void; sit(seatId: number): void;
    bet(amount: number, queued: boolean): void; compare(targetSeatId: number): void;
}

const ACTION_NODE: Readonly<Record<keyof ZjhActions, string>> = Object.freeze({
    canStart: 'ZjhContract/Btn_Start', canLook: 'OperateBtn/ShowCardBtn',
    canBet: 'OperateBtn/FollowBtn', canPreBet: 'ZjhContract/Btn_PreBet',
    canFold: 'OperateBtn/DropBtn', canCompare: 'ZjhContract/Btn_Compare',
    canContinue: 'ZjhContract/Btn_Continue',
});
const ACTION_NAME: Readonly<Record<keyof ZjhActions, ZjhRoomAction>> = Object.freeze({
    canStart: 'start', canLook: 'look', canBet: 'bet', canPreBet: 'preBet',
    canFold: 'fold', canCompare: 'compare', canContinue: 'continue',
});

const SEAT_POSITIONS = Object.freeze({
    8: Object.freeze([[-300.013, -270], [450, -100], [450, 100], [280, 280],
        [0, 280], [-280, 280], [-450, 100], [-450, -100]] as const),
    10: Object.freeze([[-300.013, -270], [450, -150], [450, -20], [450, 110], [280, 280],
        [0, 280], [-280, 280], [-450, 110], [-450, -20], [-450, -150]] as const),
});

/** Staged XQP landscape adapter. It renders only authoritative ZJH snapshot state. */
export class ZjhRoomViewAdapter implements ZjhRoomView {
    private readonly actionNodes = new Map<keyof ZjhActions, Node>();
    private readonly boundNodes = new Set<Node>();
    private readonly sittableSeats = new Set<number>();
    private readonly compareTargets = new Set<number>();
    private readonly optionNodes = new Set<Node>();
    private readonly playerToSeat = new Map<number, number>();
    private seatLimit: 8 | 10 = 10;
    private localSeat = -1;

    public constructor(private readonly root: Node, private readonly actionSink: ZjhRoomActionSink) {
        // The contract layer is authored inactive so its placeholder controls do not
        // pollute the reference prefab. Runtime owns its visibility and must enable
        // the parent before any child action or settlement label can be presented.
        this.require('ZjhContract').active = true;
        for (const key of Object.keys(ACTION_NODE) as (keyof ZjhActions)[]) {
            const node = this.require(ACTION_NODE[key]);
            if (!node.getComponent(Button)) throw new Error(`[ZJH] button missing: ${ACTION_NODE[key]}`);
            this.actionNodes.set(key, node);
            this.bind(node, () => {
                if ((key === 'canBet' || key === 'canPreBet' || key === 'canCompare') && this.hasSelection()) {
                    this.clearSelection(); return;
                }
                this.actionSink.invoke(ACTION_NAME[key]);
            });
        }
        for (let visual = 0; visual < 10; visual++) {
            const player = this.require(`Players/${visual}`);
            const hitArea = player.getComponent(UITransform) ?? player.addComponent(UITransform);
            // XQP 的座位根节点原本没有 UITransform，浏览器真实触摸无法命中；
            // 明确的座位点击区只负责入座/比牌选择，不承载权威状态。
            hitArea.setContentSize(150, 150);
            this.bind(player, () => this.invokeSeat(this.authoritySeat(visual)));
            this.bind(this.require(`Players/${visual}/CompareBtn`), () => this.invokeSeat(this.authoritySeat(visual)));
        }
    }

    public configureLayout(seatLimit: 8 | 10, localSeat: number): void {
        this.seatLimit = seatLimit; this.localSeat = localSeat >= 0 && localSeat < seatLimit ? localSeat : -1;
        for (let visual = 0; visual < 10; visual++) {
            const player = this.require(`Players/${visual}`);
            player.active = visual < seatLimit;
            const position = SEAT_POSITIONS[seatLimit][visual];
            if (position) player.setPosition(position[0], position[1], 0);
        }
    }
    public showRound(round: number): void { this.setLabel('ZjhContract/Lb_Round', `第 ${round} 局`); }
    public showPot(value: number): void { this.setLabel('Middle/TotalCent/BetNum/Num', String(value)); }
    public showOperator(seat: number, deadline: number): void {
        const remain = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        this.setLabel('ZjhContract/Lb_Operator', seat < 0 ? '' : `${seat + 1}号位操作中`);
        this.setLabel('ZjhContract/Lb_Countdown', seat < 0 ? '' : String(remain));
        this.require('Clock').active = seat >= 0;
        for (let authority = 0; authority < this.seatLimit; authority++)
            this.require(`${this.seatPath(authority)}/CountDown`).active = authority === seat;
    }
    public showSeat(seat: number, state: Readonly<ZjhSeatState>, phase: ZjhSnapshot['state']): void {
        const path = this.seatPath(seat); this.playerToSeat.set(state.playerId, seat);
        this.require(path).active = true; this.sittableSeats.delete(seat);
        this.require(`${path}/ZjhInfo`).active = true;
        this.setLabel(`${path}/ZjhInfo/Lb_Name`, `玩家 ${state.playerId}`);
        this.setLabel(`${path}/ZjhInfo/Lb_Status`, phase === 'WAITING' ? '已坐下'
            : state.comparedOut ? '比牌出局' : !state.active ? '已弃牌' : state.looked ? '已看牌' : '闷牌');
        this.require(`${path}/BetArea`).active = state.committedBet > 0;
        this.setLabel(`${path}/BetArea/Num`, String(state.committedBet));
        const reveal = state.cards.length > 0;
        this.require(`${path}/PokerPos`).active = !reveal && state.cardCount > 0;
        this.require(`${path}/ShowPoker`).active = reveal;
        for (let card = 1; card <= 3; card++) {
            this.require(`${path}/PokerPos/${card}`).active = !reveal && card <= state.cardCount;
            this.require(`${path}/ShowPoker/${card}`).active = reveal && card <= state.cards.length;
        }
        this.require(`${path}/LookNode`).active = state.looked && state.active;
        this.require(`${path}/DropNode`).active = !state.active && !state.comparedOut;
        this.require(`${path}/LoseNode`).active = state.comparedOut;
        this.require(`${path}/OperationDisplay/Drop`).active = !state.active && !state.comparedOut;
        this.require(`${path}/OperationDisplay/Compare`).active = state.comparedOut;
        this.require(`${path}/CompareBtn`).active = this.compareTargets.has(seat);
    }
    public showEmptySeat(seat: number, canSit: boolean): void {
        const path = this.seatPath(seat); this.require(path).active = true;
        this.require(`${path}/ZjhInfo`).active = true;
        if (canSit) this.sittableSeats.add(seat); else this.sittableSeats.delete(seat);
        this.setLabel(`${path}/ZjhInfo/Lb_Name`, canSit ? '点击坐下' : '空位');
        this.setLabel(`${path}/ZjhInfo/Lb_Status`, '');
        for (const child of ['BetArea', 'PokerPos', 'ShowPoker', 'LookNode', 'DropNode', 'LoseNode', 'CompareBtn'])
            this.require(`${path}/${child}`).active = false;
    }
    public hideSeat(seat: number): void { this.sittableSeats.delete(seat); this.require(this.seatPath(seat)).active = false; }
    public showWinner(seat: number): void {
        this.require(`${this.seatPath(seat)}/Effect`).active = true; this.require('Effect').active = true;
    }
    public showSettlement(_roundNo: number, settlement: Readonly<ZjhSettlementResult>): void {
        for (const entry of settlement.entries) {
            const seat = this.playerToSeat.get(entry.playerId) ?? -1;
            if (seat >= 0) {
                const node = this.require(`${this.seatPath(seat)}/SmallSettlementCent`); node.active = true;
                this.setLabel(`${this.seatPath(seat)}/SmallSettlementCent/WinNum`,
                    `${entry.scoreDelta >= 0 ? '+' : ''}${entry.scoreDelta}`);
            }
        }
        this.require('Effect').active = true;
        // The runtime entry owns the authoritative SmallSettlement/BigSettlement_0 overlays.
        // The table adapter keeps only the seat-local score animation.
    }
    public showBetOptions(amounts: readonly number[], queued: boolean): void {
        this.clearSelection();
        const container = this.require('OperateBtn/Bet/Fast');
        const template = this.require('OperateBtn/Bet/Fast/FastBtn');
        amounts.forEach((amount, index) => {
            const option = instantiate(template); option.name = `ZJH_${queued ? 'PreBet' : 'Bet'}_${amount}`;
            option.active = true; option.setPosition(new Vec3(index * 118, 0, 0));
            const label = option.getChildByName('Num')?.getComponent(Label); if (label) label.string = String(amount);
            this.bind(option, () => { this.clearSelection(); this.actionSink.bet(amount, queued); });
            container.addChild(option); this.optionNodes.add(option);
        });
    }
    public showCompareTargets(seats: readonly number[]): void {
        this.clearSelection();
        seats.forEach(seat => { this.compareTargets.add(seat); this.require(`${this.seatPath(seat)}/CompareBtn`).active = true; });
        this.setLabel(`${ACTION_NODE.canCompare}/Lab`, '取消比牌');
    }
    public setActions(actions: Readonly<ZjhActions>): void {
        // Any authoritative render invalidates local choices. Reopen from the fresh snapshot to avoid stale targets/amounts.
        if (this.hasSelection()) this.clearSelection();
        for (const key of Object.keys(ACTION_NODE) as (keyof ZjhActions)[]) {
            const node = this.actionNodes.get(key); if (node) node.active = actions[key];
        }
        this.require('OperateBtn/Bet').active = actions.canBet;
    }
    public clearTransientEffects(): void {
        this.require('Effect').active = false;
        this.require('ZjhContract/Settlement').active = false;
        for (let visual = 0; visual < this.seatLimit; visual++) {
            this.require(`Players/${visual}/Effect`).active = false;
            this.require(`Players/${visual}/SmallSettlementCent`).active = false;
        }
        this.clearSelection();
    }
    public dispose(): void {
        for (const node of this.boundNodes) node.targetOff(this);
        this.boundNodes.clear(); this.sittableSeats.clear(); this.compareTargets.clear(); this.optionNodes.clear();
    }

    private seatPath(authority: number): string { return `Players/${this.visualSeat(authority)}`; }
    private visualSeat(authority: number): number {
        return this.localSeat < 0 ? authority : (authority - this.localSeat + this.seatLimit) % this.seatLimit;
    }
    private authoritySeat(visual: number): number {
        return this.localSeat < 0 ? visual : (visual + this.localSeat) % this.seatLimit;
    }
    private invokeSeat(seat: number): void {
        if (this.compareTargets.has(seat)) { this.clearSelection(); this.actionSink.compare(seat); }
        else if (this.sittableSeats.has(seat)) this.actionSink.sit(seat);
    }
    private bind(node: Node, action: () => void): void {
        let lastInvokeAt = 0;
        const invoke = (): void => { const now = Date.now(); if (!node.active || now - lastInvokeAt < 180) return;
            lastInvokeAt = now; action(); };
        node.on(Button.EventType.CLICK, invoke, this); node.on(Node.EventType.TOUCH_END, invoke, this);
        node.on(Node.EventType.MOUSE_UP, invoke, this); this.boundNodes.add(node);
    }
    private hasSelection(): boolean { return this.optionNodes.size > 0 || this.compareTargets.size > 0; }
    private clearSelection(): void {
        for (const node of this.optionNodes) { this.boundNodes.delete(node); node.destroy(); }
        this.optionNodes.clear();
        for (const seat of this.compareTargets) this.require(`${this.seatPath(seat)}/CompareBtn`).active = false;
        this.compareTargets.clear();
        this.setLabel(`${ACTION_NODE.canCompare}/Lab`, '选择比牌');
    }
    private require(path: string): Node {
        let node: Node | null = this.root;
        for (const segment of path.split('/')) node = node?.getChildByName(segment) ?? null;
        if (!node) throw new Error(`[ZJH] prefab node missing: ${path}`); return node;
    }
    private setLabel(path: string, value: string): void {
        const label = this.require(path).getComponent(Label);
        if (!label) throw new Error(`[ZJH] label missing: ${path}`); label.string = value;
    }
}
