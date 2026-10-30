import {
    Button,
    Color,
    instantiate,
    Label,
    Layers,
    Node,
    Prefab,
    RenderRoot2D,
    Sprite,
    SpriteAtlas,
    UITransform,
    Widget,
} from 'cc';

export interface Chengdu1001SeatView {
    readonly playerId: string;
    readonly displayName?: string;
    readonly avatarUrl?: string;
    readonly cards: readonly number[];
    readonly cardCount: number;
}

export interface Chengdu1001GangCandidate {
    readonly type: 2 | 3 | 4;
    readonly mahjongId: number;
}

export interface Chengdu1001RoomSnapshot {
    readonly roomId: number;
    readonly gameId: number;
    readonly gameCode: string;
    readonly phase: 'LOBBY' | 'PLAYING' | 'SETTLED';
    readonly stateVersion: number;
    readonly lastDiscard?: number;
    readonly currentSeatHasDrawn?: boolean;
    readonly legalActions?: readonly string[];
    readonly gangCandidates: readonly Chengdu1001GangCandidate[];
    readonly readySeats?: readonly number[];
    readonly started: boolean;
    readonly currentSeat: number;
    readonly finished: boolean;
    readonly winners: readonly number[];
    readonly openingPhase: 'WAITING' | 'EXCHANGE' | 'DINGQUE' | 'PLAYING';
    readonly openingSelections?: {
        readonly exchanges: Readonly<Record<string, boolean>>;
        readonly missingSuits: Readonly<Record<string, boolean>>;
    };
    readonly seats: Readonly<Record<string, Chengdu1001SeatView>>;
    readonly createRules?: Readonly<Record<string, unknown>>;
    readonly roundNo: number;
    readonly roundScored: boolean;
    readonly completedRounds: number;
    readonly totalRounds: number;
    readonly roomFinished: boolean;
    readonly roundScoreDelta?: Readonly<Record<string, number>>;
    readonly totalScore: Readonly<Record<string, number>>;
    readonly continueSeats: readonly number[];
}

export interface Chengdu1001RoomActions {
    readonly draw: () => Promise<void>;
    readonly discard: (tile: number) => Promise<void>;
    readonly hu: () => Promise<void>;
    readonly pass: () => Promise<void>;
    readonly peng: (tiles: readonly number[]) => Promise<void>;
    readonly gang: (candidate: Chengdu1001GangCandidate, stateVersion: number) => Promise<void>;
    readonly exchange: (tiles: readonly number[]) => Promise<void>;
    readonly dingque: (suit: 'WAN' | 'TIAO' | 'TONG') => Promise<void>;
    readonly refresh: () => Promise<void>;
}

/** Creator-native Chengdu1001 table. It projects authority state and emits intents only. */
export class Chengdu1001RoomView {
    public readonly root = new Node('Chengdu1001AuthoritativeRoom');
    private readonly selectedTiles = new Set<number>();
    private snapshot: Chengdu1001RoomSnapshot | null = null;
    private localSeat = -1;
    private localPlayerId = 0;
    private tableView: Node | null = null;

    public constructor(private readonly actions: Chengdu1001RoomActions,
        mahjongRoomPresentationPrefab: Prefab, private readonly tileAtlas: SpriteAtlas) {
        this.root.layer = Layers.Enum.UI_2D;
        this.root.addComponent(RenderRoot2D);
        this.root.addComponent(UITransform).setContentSize(1600, 900);
        const widget = this.root.addComponent(Widget);
        widget.isAlignLeft = widget.isAlignRight = widget.isAlignTop = widget.isAlignBottom = true;
        widget.left = widget.right = widget.top = widget.bottom = 0;

        this.mountMahjongRoomPrefab(mahjongRoomPresentationPrefab);
        this.validateNativeTree();
    }

    public render(snapshot: Chengdu1001RoomSnapshot, localPlayerId: number): void {
        this.selectedTiles.clear();
        this.snapshot = snapshot;
        this.localPlayerId = localPlayerId;
        this.localSeat = this.findLocalSeat(snapshot, localPlayerId);
        this.renderSeats(snapshot);
        this.renderHand(snapshot);
        this.renderActions(snapshot);
    }

    public showError(message: string): void {
        const status = this.requireLabel(this.requireTable(), 'Direction/Time');
        status.string = `失败：${message}`;
        status.color = new Color(255, 208, 150, 255);
    }

    public showRoomNotice(message: string): void {
        const status = this.requireLabel(this.requireTable(), 'Direction/Time');
        status.string = message;
        status.color = new Color(255, 255, 255, 255);
    }

    public destroy(): void {
        this.tableView = null;
        if (this.root.isValid) this.root.destroy();
    }

    private renderSeats(snapshot: Chengdu1001RoomSnapshot): void {
        for (let seat = 0; seat < 4; seat += 1) {
            const player = this.requireNode(this.requireTable(), this.seatPath(seat));
            const data = snapshot.seats[String(seat)];
            this.requireNode(player, 'PutCard').active = Boolean(data);
            this.requireNode(player, 'PileCard').active = Boolean(data);
            const cover = this.requireNode(player, 'HandCardCover');
            cover.active = Boolean(data && seat !== this.localSeat);
            for (const child of cover.children) {
                const index = Number(child.name);
                child.active = Boolean(data && Number.isSafeInteger(index) && index < data.cardCount);
            }
            const out = this.requireNode(player, 'OutCard');
            const lastDiscard = Number(snapshot.lastDiscard);
            out.active = Boolean(data && seat === snapshot.currentSeat
                && Number.isSafeInteger(lastDiscard) && lastDiscard > 0);
            if (out.active && Number.isSafeInteger(lastDiscard) && lastDiscard > 0) this.setTile(out, lastDiscard);
        }
        const direction = this.requireNode(this.requireTable(), 'Direction');
        for (let seat = 0; seat < 4; seat += 1) this.requireNode(direction, String(seat)).active = seat === snapshot.currentSeat;
        this.requireLabel(this.requireTable(), 'Direction/Time').string = `${snapshot.phase} · v${snapshot.stateVersion}`;
        const visibleCards = Object.values(snapshot.seats).reduce((sum, seat) => sum + seat.cardCount, 0);
        this.requireLabel(this.requireTable(), 'ResidueCard/Num').string = String(Math.max(0, 108 - visibleCards));
    }

    private renderHand(snapshot: Chengdu1001RoomSnapshot): void {
        const own = this.localSeat >= 0 ? snapshot.seats[String(this.localSeat)] : undefined;
        // The native presentation keeps the local hand in the physical Seat_0
        // host; snapshot seat ids remain authoritative for player membership.
        const hand = this.requireNode(this.requireTable(), this.seatPath(0, 'HandCard'));
        const touchArea = this.requireNode(this.requireTable(), this.seatPath(0, 'HandTouchArea'));
        const cover = this.requireNode(this.requireTable(), this.seatPath(0, 'HandCardCover'));
        hand.active = Boolean(own?.cards.length);
        touchArea.active = Boolean(own?.cards.length);
        cover.active = Boolean(own && own.cards.length === 0 && own.cardCount > 0);
        for (const child of hand.children) child.active = false;
        (own?.cards ?? []).forEach((tile, index) => {
            const card = this.requireNode(hand, index === 13 ? 'Touch' : String(index));
            const selected = this.selectedTiles.has(index);
            card.active = true;
            // The authority uses -1 for a concealed/undisclosed tile in a
            // public snapshot.  That is a valid state, not a sprite id; keep
            // the prefab's card-back frame instead of rejecting the whole
            // snapshot while trying to resolve `1/hand/-1`.
            if (Number.isSafeInteger(tile) && tile > 0) this.setTile(card, tile);
            card.setPosition(card.position.x, selected ? 18 : 0, card.position.z);
            card.off(Node.EventType.TOUCH_END);
            card.on(Node.EventType.TOUCH_END, () => {
                this.toggleTile(index); this.renderHand(snapshot); this.renderActions(snapshot);
            }, this);
        });
    }

    private renderActions(snapshot: Chengdu1001RoomSnapshot): void {
        this.renderOperationButtons(snapshot);
    }

    private renderOperationButtons(snapshot: Chengdu1001RoomSnapshot): void {
        const bar = this.requireNode(this.requireTable(), 'OperateBtn');
        for (const child of bar.children) child.active = false;
        const available = new Set(snapshot.legalActions ?? []);
        const actions: Array<{ name: string; run: () => Promise<void>; candidate?: Chengdu1001GangCandidate }> = [];
        if (this.localSeat >= 0 && snapshot.openingPhase === 'EXCHANGE'
            && !this.hasSubmittedOpening(snapshot, 'exchanges')) {
            actions.push({ name: 'ExchangeCard', run: () => this.actions.exchange(this.selectedCardValues(snapshot)) });
        } else if (this.localSeat >= 0 && snapshot.openingPhase === 'DINGQUE'
            && !this.hasSubmittedOpening(snapshot, 'missingSuits')) {
            const lack = this.requireNode(bar, 'Lack');
            const suits: readonly ('WAN' | 'TIAO' | 'TONG')[] = ['WAN', 'TIAO', 'TONG'];
            suits.forEach((suit, index) => this.bindNativeButton(this.requireNode(lack, String(index)),
                () => this.actions.dingque(suit)));
            lack.active = true;
        } else if (snapshot.phase === 'PLAYING') {
            if (available.has('PENG')) actions.push({ name: 'Peng', run: () => this.actions.peng(this.pairTiles(snapshot, 2)) });
            if (available.has('GANG') && snapshot.gangCandidates[0]) actions.push({ name: 'Gang',
                candidate: snapshot.gangCandidates[0],
                run: () => this.actions.gang(snapshot.gangCandidates[0], snapshot.stateVersion) });
            if (available.has('HU')) {
                const selfDraw = snapshot.currentSeat === this.localSeat && snapshot.currentSeatHasDrawn;
                actions.push({ name: selfDraw ? 'ZiMo' : 'Hu', run: this.actions.hu });
            }
            if (available.has('PASS')) actions.push({ name: 'Pass', run: this.actions.pass });
            if (available.has('DISCARD')) {
                actions.push({ name: 'Play', run: () => this.actions.discard(this.selectedCardValues(snapshot)[0]) });
            }
        }
        actions.forEach(({ name, run, candidate }) => {
            const node = this.requireNode(bar, name);
            if (candidate) {
                const tileNode = node.getChildByName('Mahjong');
                if (!tileNode) throw new Error('[chengdu1001] MJ_CommonRoom_2D missing OperateBtn/Gang/Mahjong');
                tileNode.active = candidate.type === 3 || candidate.type === 4;
                if (tileNode.active) this.setTile(tileNode, candidate.mahjongId);
            }
            const buttonNode = this.findButtonTemplate(node) ?? node;
            this.bindNativeButton(buttonNode, run);
            node.active = true;
        });
        bar.active = bar.children.some(child => child.active);
    }

    private pairTiles(snapshot: Chengdu1001RoomSnapshot, count: number): readonly number[] {
        const cards = snapshot.seats[String(this.localSeat)]?.cards ?? [];
        const matching = cards.filter(tile => tile === snapshot.lastDiscard).slice(0, count);
        if (matching.length !== count) throw new Error('手牌不足，无法碰或杠');
        return matching;
    }

    private hasSubmittedOpening(snapshot: Chengdu1001RoomSnapshot, choice: 'exchanges' | 'missingSuits'): boolean {
        return this.localSeat >= 0 && snapshot.openingSelections?.[choice]?.[String(this.localSeat)] === true;
    }

    private mountMahjongRoomPrefab(presentationPrefab: Prefab): void {
        const table = instantiate(presentationPrefab);
        this.setLayerRecursively(table);
        const operationBar = table.getChildByName('OperateBtn');
        if (operationBar) {
            operationBar.active = false;
        }
        this.tableView = table;
        this.root.addChild(table);
        table.setSiblingIndex(0);
        if (this.snapshot) this.render(this.snapshot, this.localPlayerId);
    }

    private findButtonTemplate(node: Node | null): Node | null {
        if (!node) return null;
        if (node.getComponent(Button)) return node;
        for (const child of node.children) {
            const found = this.findButtonTemplate(child);
            if (found) return found;
        }
        return null;
    }

    private run(action: () => Promise<void>): void {
        try {
            void action().catch(error => {
                this.showError(error instanceof Error ? error.message : String(error));
            });
        } catch (error) {
            this.showError(error instanceof Error ? error.message : String(error));
        }
    }

    private toggleTile(index: number): void {
        if (this.selectedTiles.has(index)) this.selectedTiles.delete(index);
        else if (this.selectedTiles.size < 3) this.selectedTiles.add(index);
    }

    private selectedCardValues(snapshot: Chengdu1001RoomSnapshot): readonly number[] {
        const own = this.localSeat >= 0 ? snapshot.seats[String(this.localSeat)] : undefined;
        if (!own) return [];
        return [...this.selectedTiles].sort((a, b) => a - b)
            .map(index => own.cards[index]).filter((tile): tile is number => Number.isSafeInteger(tile));
    }

    private findLocalSeat(snapshot: Chengdu1001RoomSnapshot, playerId: number): number {
        for (const [seat, data] of Object.entries(snapshot.seats)) {
            if (String(data.playerId) === String(playerId)) return Number(seat);
        }
        return -1;
    }

    private setLayerRecursively(node: Node): void {
        node.layer = Layers.Enum.UI_2D;
        for (const child of node.children) this.setLayerRecursively(child);
    }

    private requireTable(): Node {
        if (!this.tableView) throw new Error('[chengdu1001] MJ_CommonRoom_2D is not mounted');
        return this.tableView;
    }

    private seatPath(seat: number, child?: string): string {
        const base = `Players/Seat_${seat}`;
        return child ? `${base}/${child}` : base;
    }

    private requireNode(root: Node, path: string): Node {
        const node = root.getChildByPath(path);
        if (!node) throw new Error(`[chengdu1001] ${root.name} missing ${path}`);
        return node;
    }

    private requireLabel(root: Node, path: string): Label {
        const node = this.requireNode(root, path);
        const label = node.getComponent(Label);
        if (!label) throw new Error(`[chengdu1001] ${root.name} missing Label on ${path}`);
        return label;
    }

    private bindNativeButton(node: Node, action: () => Promise<void>): void {
        const button = node.getComponent(Button);
        if (!button) throw new Error(`[chengdu1001] ${node.name} missing native Button`);
        button.clickEvents = [];
        node.off(Button.EventType.CLICK);
        node.on(Button.EventType.CLICK, () => this.run(action), this);
    }

    private setTile(node: Node, tile: number): void {
        const sprite = node.getComponent(Sprite);
        const icon = node.getChildByName('Icon')?.getComponent(Sprite);
        const target = sprite ?? icon;
        if (!target) throw new Error(`[chengdu1001] ${node.name} missing native tile Sprite`);
        const frame = this.tileAtlas.getSpriteFrame(`1/hand/${tile}`);
        if (!frame) throw new Error(`[chengdu1001] tile atlas missing 1/hand/${tile}`);
        target.spriteFrame = frame;
    }

    private validateNativeTree(): void {
        const table = this.requireTable();
        for (const path of ['BG', 'Direction', 'ResidueCard/Num', this.seatPath(0, 'HandCard'),
            this.seatPath(0, 'HandCard/Touch'), this.seatPath(0, 'HandTouchArea'),
            this.seatPath(0, 'HandCardCover'), 'OutCardHint', 'PengGangHint',
            'HuTips', 'ExchangeSpine', 'OperateBtn/Peng', 'OperateBtn/Gang', 'OperateBtn/Hu',
            'OperateBtn/ZiMo', 'OperateBtn/Pass', 'OperateBtn/Play', 'OperateBtn/Lack',
            'OperateBtn/ExchangeCard']) this.requireNode(table, path);
        for (let seat = 0; seat < 4; seat += 1) {
            for (const child of ['PutCard', 'PileCard', 'OutCard']) {
                this.requireNode(table, this.seatPath(seat, child));
            }
        }
    }
}
