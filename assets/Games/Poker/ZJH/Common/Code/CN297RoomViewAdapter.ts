import { Button, Label, Node } from 'cc';
import { CN297Actions, CN297RoomView } from './CN297RoomPresenter';
import { CN297SeatState, CN297Snapshot } from './CN297RoomState';

export type CN297RoomAction = 'start' | 'look' | 'bet' | 'preBet' | 'fold' | 'compare' | 'continue';

export interface CN297RoomActionSink {
    invoke(action: CN297RoomAction): void;
    sit(seatId: number): void;
}

const ACTION_NODE: Readonly<Record<keyof CN297Actions, string>> = Object.freeze({
    canStart: 'Btn/Btn_Start', canLook: 'Btn/Btn_Look', canBet: 'Btn/Btn_Bet',
    canPreBet: 'Btn/Btn_PreBet', canFold: 'Btn/Btn_Fold', canCompare: 'Btn/Btn_Compare', canContinue: 'Btn/Btn_Continue',
});

const ACTION_NAME: Readonly<Record<keyof CN297Actions, CN297RoomAction>> = Object.freeze({
    canStart: 'start', canLook: 'look', canBet: 'bet', canPreBet: 'preBet',
    canFold: 'fold', canCompare: 'compare', canContinue: 'continue',
});

/**
 * CN297 横竖屏 Prefab 的统一节点契约。两个布局只改变坐标与尺寸，节点路径、按钮语义和渲染逻辑保持一致。
 */
export class CN297RoomViewAdapter implements CN297RoomView {
    private readonly actionNodes = new Map<keyof CN297Actions, Node>();
    private readonly boundNodes = new Set<Node>();
    private readonly sittableSeats = new Set<number>();

    public constructor(private readonly root: Node, private readonly actionSink: CN297RoomActionSink) {
        for (const key of Object.keys(ACTION_NODE) as (keyof CN297Actions)[]) {
            const node = this.require(ACTION_NODE[key]);
            if (!node.getComponent(Button)) throw new Error(`[CN297] button missing: ${ACTION_NODE[key]}`);
            this.actionNodes.set(key, node);
            let lastInvokeAt = 0;
            const invoke = (): void => {
                const button = node.getComponent(Button);
                const now = Date.now();
                if (!node.active || !button?.interactable || now - lastInvokeAt < 180) return;
                lastInvokeAt = now;
                this.actionSink.invoke(ACTION_NAME[key]);
            };
            node.on(Button.EventType.CLICK, invoke, this);
            // Preview 在部分浏览器中不会合成 CLICK，同时监听真实指针结束事件并用时间窗去重。
            node.on(Node.EventType.TOUCH_END, invoke, this);
            node.on(Node.EventType.MOUSE_UP, invoke, this);
            this.boundNodes.add(node);
        }
        for (let seat = 0; seat < 10; seat++) {
            const node = this.require(`Seats/Seat_${seat}`);
            const invokeSit = (): void => { if (this.sittableSeats.has(seat)) this.actionSink.sit(seat); };
            node.on(Node.EventType.TOUCH_END, invokeSit, this);
            node.on(Node.EventType.MOUSE_UP, invokeSit, this);
            this.boundNodes.add(node);
        }
    }

    public showRound(round: number): void { this.setLabel('Header/Label', `第 ${round} 局`); }
    public showPot(value: number): void { this.setLabel('Table/Lb_Pot', `底池 ${value}`); }
    public showOperator(seat: number, deadline: number): void {
        this.setLabel('Table/Lb_Operator', seat < 0 ? '' : `${seat + 1}号位操作中`);
        this.setLabel('Table/Lb_Countdown', seat < 0 ? '' : String(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))));
    }
    public showSeat(seat: number, state: Readonly<CN297SeatState>, phase: CN297Snapshot['state']): void {
        const path = `Seats/Seat_${seat}`;
        const node = this.require(path);
        node.active = true;
        this.sittableSeats.delete(seat);
        this.setLabel(`${path}/Lb_Name`, `玩家 ${state.playerId}`);
        this.setLabel(`${path}/Lb_Bet`, state.committedBet > 0 ? `下注 ${state.committedBet}` : '');
        this.setLabel(`${path}/Lb_Status`, phase === 'WAITING' ? '已坐下'
            : state.comparedOut ? '比牌出局' : !state.active ? '已弃牌' : state.looked ? '已看牌' : '闷牌');
        this.setLabel(`${path}/Lb_Cards`, state.cards.length > 0 ? state.cards.join('  ') : `牌背 ×${state.cardCount}`);
    }
    public showEmptySeat(seat: number, canSit: boolean): void {
        const path = `Seats/Seat_${seat}`;
        this.require(path).active = true;
        if (canSit) this.sittableSeats.add(seat); else this.sittableSeats.delete(seat);
        this.setLabel(`${path}/Lb_Name`, canSit ? '点击坐下' : '空位');
        this.setLabel(`${path}/Lb_Bet`, ''); this.setLabel(`${path}/Lb_Status`, '');
        this.setLabel(`${path}/Lb_Cards`, '模板头像');
    }
    public hideSeat(seat: number): void {
        this.sittableSeats.delete(seat);
        this.require(`Seats/Seat_${seat}`).active = false;
    }
    public showWinner(seat: number): void {
        const node = this.require('Effects/Winner');
        node.active = true;
        this.setLabel('Effects/Winner/Label', `${seat + 1}号位获胜`);
    }
    public setActions(actions: Readonly<CN297Actions>): void {
        for (const key of Object.keys(ACTION_NODE) as (keyof CN297Actions)[]) {
            const node = this.actionNodes.get(key);
            if (node) node.active = actions[key];
        }
    }
    public clearTransientEffects(): void { this.require('Effects/Winner').active = false; }
    public dispose(): void {
        for (const node of this.boundNodes) node.targetOff(this);
        this.boundNodes.clear();
        this.sittableSeats.clear();
    }

    private require(path: string): Node {
        let node: Node | null = this.root;
        for (const segment of path.split('/')) node = node?.getChildByName(segment) ?? null;
        if (!node) throw new Error(`[CN297] prefab node missing: ${path}`);
        return node;
    }
    private setLabel(path: string, value: string): void {
        const label = this.require(path).getComponent(Label);
        if (!label) throw new Error(`[CN297] label missing: ${path}`);
        label.string = value;
    }
}
