import {
    assetManager,
    Button,
    Color,
    Graphics,
    HorizontalTextAlignment,
    instantiate,
    Label,
    Layers,
    Node,
    Prefab,
    RenderRoot2D,
    Sprite,
    SpriteAtlas,
    UITransform,
    Vec3,
    VerticalTextAlignment,
    Widget,
} from 'cc';

export interface CD101SeatView {
    readonly playerId: string;
    readonly cards: readonly number[];
    readonly cardCount: number;
}

export interface CD101GangCandidate {
    readonly type: 2 | 3 | 4;
    readonly mahjongId: number;
}

export interface CD101RoomSnapshot {
    readonly roomId: number;
    readonly gameCode: string;
    readonly phase: 'LOBBY' | 'PLAYING' | 'SETTLED';
    readonly stateVersion: number;
    readonly lastDiscard?: number;
    readonly currentSeatHasDrawn?: boolean;
    readonly legalActions?: readonly string[];
    readonly gangCandidates: readonly CD101GangCandidate[];
    readonly started: boolean;
    readonly currentSeat: number;
    readonly finished: boolean;
    readonly winners: readonly number[];
    readonly openingPhase: 'WAITING' | 'EXCHANGE' | 'DINGQUE' | 'PLAYING';
    readonly openingSelections?: {
        readonly exchanges: Readonly<Record<string, boolean>>;
        readonly missingSuits: Readonly<Record<string, boolean>>;
    };
    readonly seats: Readonly<Record<string, CD101SeatView>>;
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

export interface CD101RoomActions {
    readonly ready: () => Promise<void>;
    readonly start: () => Promise<void>;
    readonly draw: () => Promise<void>;
    readonly discard: (tile: number) => Promise<void>;
    readonly hu: () => Promise<void>;
    readonly pass: () => Promise<void>;
    readonly peng: (tiles: readonly number[]) => Promise<void>;
    readonly gang: (candidate: CD101GangCandidate, stateVersion: number) => Promise<void>;
    readonly exchange: (tiles: readonly number[]) => Promise<void>;
    readonly dingque: (suit: 'WAN' | 'TIAO' | 'TONG') => Promise<void>;
    readonly refresh: () => Promise<void>;
    readonly exit: () => Promise<void>;
}

/** Creator-native CD101 table. It projects authority state and emits intents only. */
export class CD101RoomView {
    public readonly root = new Node('CD101AuthoritativeRoom');
    private readonly title: Label;
    private readonly status: Label;
    private readonly seatsLayer: Node;
    private readonly handLayer: Node;
    private readonly actionsLayer: Node;
    private readonly commonRoom: Node;
    private readonly selectedTiles = new Set<number>();
    private snapshot: CD101RoomSnapshot | null = null;
    private localSeat = -1;
    private localPlayerId = 0;
    private tableView: Node | null = null;

    public constructor(private readonly actions: CD101RoomActions, commonRoomPrefab: Prefab,
        private readonly tileAtlas: SpriteAtlas) {
        this.root.layer = Layers.Enum.UI_2D;
        this.root.addComponent(RenderRoot2D);
        this.root.addComponent(UITransform).setContentSize(1600, 900);
        const widget = this.root.addComponent(Widget);
        widget.isAlignLeft = widget.isAlignRight = widget.isAlignTop = widget.isAlignBottom = true;
        widget.left = widget.right = widget.top = widget.bottom = 0;

        this.title = this.label(this.root, 'Title', '成都血战麻将', 40, new Vec3(0, 392), 720, 60);
        this.title.node.active = false;
        this.status = this.label(this.root, 'AuthorityStatus', '正在连接权威牌局…', 24,
            new Vec3(0, 300), 1000, 52, new Color(235, 242, 224, 255));
        this.status.node.active = false;
        this.seatsLayer = this.layer(this.root, 'Seats');
        this.handLayer = this.layer(this.root, 'LocalHand');

        // Reuse the authored, game-neutral room chrome rather than recreating its
        // buttons and room labels. Only this instance is adjusted for CD101.
        this.commonRoom = instantiate(commonRoomPrefab);
        this.setLayerRecursively(this.commonRoom);
        this.commonRoom.getComponent(Widget)?.destroy();
        this.commonRoom.getComponent(UITransform)?.setContentSize(1280, 720);
        this.commonRoom.setScale(1.25, 1.25, 1);
        this.root.addChild(this.commonRoom);
        for (const overlay of [this.status.node, this.seatsLayer, this.handLayer]) {
            overlay.setSiblingIndex(this.root.children.length - 1);
        }
        for (const path of [
            'Btn/Btn_Gps', 'Btn/Btn_Voice', 'Btn/Btn_Chat', 'Btn/Btn_More',
            'Btn/Btn_SmallSettlement', 'RealTimeRecord', 'RubCard', 'CardCounter',
        ]) {
            const node = this.commonRoom.getChildByPath(path);
            if (node) node.active = false;
        }
        const back = this.commonRoom.getChildByPath('Btn/Btn_Back');
        if (!back?.getComponent(Button)) throw new Error('[CD101] CommonRoom is missing Btn_Back');
        back.on(Button.EventType.CLICK, () => this.run(this.actions.exit), this);

        // Keep controls above the shared room chrome and inside the actual viewport.
        this.actionsLayer = this.layer(this.root, 'Actions');
        this.actionsLayer.addComponent(UITransform).setContentSize(1000, 70);
        const actionsWidget = this.actionsLayer.addComponent(Widget);
    actionsWidget.isAlignTop = true;
    actionsWidget.top = 90;
        void this.loadTablePrefab();
    }

    public render(snapshot: CD101RoomSnapshot, localPlayerId: number): void {
        this.selectedTiles.clear();
        this.snapshot = snapshot;
        this.localPlayerId = localPlayerId;
        this.status.node.active = false;
        this.localSeat = this.findLocalSeat(snapshot, localPlayerId);
        this.title.string = `成都血战麻将  房间 ${snapshot.roomId}`;
        this.status.string = `权威状态：${snapshot.phase} · 第 ${snapshot.roundNo || 0}/${snapshot.totalRounds} 局`
            + ` · 版本 ${snapshot.stateVersion} · 本机座位 ${this.localSeat >= 0 ? this.localSeat + 1 : '未入座'}`;
        this.commonLabel('RoomInfo/Lb_RoomId', `房间号：${snapshot.roomId}`);
        this.commonLabel('RoomInfo/Lb_Round', `第${snapshot.roundNo || 0}/${snapshot.totalRounds}局`);
        this.renderSeats(snapshot);
        this.renderHand(snapshot);
        this.renderActions(snapshot);
        console.info('[CD101RoomView]', { action: 'render', roomId: snapshot.roomId,
            stateVersion: snapshot.stateVersion, phase: snapshot.phase, localSeat: this.localSeat });
    }

    public showError(message: string): void {
        this.status.node.active = true;
        this.status.string = `操作失败：${message}`;
        this.status.color = new Color(255, 208, 150, 255);
    }

    public destroy(): void {
        if (this.root.isValid) this.root.destroy();
    }

    private renderSeats(snapshot: CD101RoomSnapshot): void {
        this.seatsLayer.destroyAllChildren();
        const positions = [new Vec3(0, -212), new Vec3(560, 72), new Vec3(0, 238), new Vec3(-560, 72)];
        const players = this.tableView?.getChildByName('Players');
        const rootTransform = this.root.getComponent(UITransform);
        for (let seat = 0; seat < 4; seat += 1) {
            const seatTransform = players?.getChildByName(String(seat))?.getComponent(UITransform);
            if (seatTransform && rootTransform) {
                positions[seat] = rootTransform.convertToNodeSpaceAR(seatTransform.convertToWorldSpaceAR(Vec3.ZERO));
            }
        }
        for (let seat = 0; seat < 4; seat += 1) {
            const data = snapshot.seats[String(seat)];
            const identity = data ? `座位 ${seat + 1} · 玩家 ${data.playerId}` : `座位 ${seat + 1} · 等待加入`;
            this.label(this.seatsLayer, `Seat_${seat}_Identity`, identity, 22,
                positions[seat].clone().add3f(0, 20, 0), 270, 38,
                seat === snapshot.currentSeat ? new Color(255, 225, 142, 255) : Color.WHITE);
            const score = data ? Number(snapshot.totalScore[data.playerId] ?? 0) : 0;
            this.label(this.seatsLayer, `Seat_${seat}_Cards`, data ? `手牌 ${data.cardCount} · 总分 ${this.score(score)}` : '', 20,
                positions[seat].clone().add3f(0, -22, 0), 270, 34, new Color(210, 233, 223, 255));
        }
    }

    private renderHand(snapshot: CD101RoomSnapshot): void {
        this.handLayer.destroyAllChildren();
        const own = this.localSeat >= 0 ? snapshot.seats[String(this.localSeat)] : undefined;
        if (!own || own.cards.length === 0) {
            this.label(this.handLayer, 'EmptyHand', snapshot.started ? '等待权威手牌' : '等待开局', 26,
                new Vec3(0, -302), 700, 50);
            return;
        }
        const gap = Math.min(76, 1040 / Math.max(1, own.cards.length));
        const start = -gap * (own.cards.length - 1) / 2;
        own.cards.forEach((tile, index) => {
            const selected = this.selectedTiles.has(index);
            const position = new Vec3(start + gap * index, selected ? -270 : -292);
            const frame = this.tileAtlas.getSpriteFrame(`1/hand/${tile}`);
            if (frame) {
                const card = this.layer(this.handLayer, `Tile_${index}`);
                card.setPosition(position);
                card.addComponent(UITransform).setContentSize(66, 88);
                const sprite = card.addComponent(Sprite);
                sprite.spriteFrame = frame;
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                sprite.color = selected ? new Color(255, 211, 116, 255) : Color.WHITE;
                card.addComponent(Button);
                card.on(Button.EventType.CLICK, () => {
                    this.toggleTile(index); this.renderHand(snapshot); this.renderActions(snapshot);
                }, this);
            } else {
                this.button(this.handLayer, `Tile_${index}`, this.tileName(tile), position, 66, 88,
                    () => { this.toggleTile(index); this.renderHand(snapshot); this.renderActions(snapshot); },
                    selected ? new Color(255, 180, 55, 255) : new Color(238, 228, 193, 255));
            }
        });
    }

    private renderActions(snapshot: CD101RoomSnapshot): void {
        this.actionsLayer.destroyAllChildren();
        const actions: Array<readonly [string, () => Promise<void>]> = [];
        if (this.localSeat >= 0 && !snapshot.started) {
            actions.push(['准备', this.actions.ready], ['开始', this.actions.start]);
        } else if (this.localSeat >= 0 && snapshot.openingPhase === 'DINGQUE'
            && !this.hasSubmittedOpening(snapshot, 'missingSuits')) {
            actions.push(['定缺万', () => this.actions.dingque('WAN')], ['定缺条', () => this.actions.dingque('TIAO')],
                ['定缺筒', () => this.actions.dingque('TONG')]);
        } else if (this.localSeat >= 0 && snapshot.legalActions?.includes('DRAW')) {
            actions.push(['摸牌', this.actions.draw]);
        }
        actions.push(['刷新', this.actions.refresh], ['返回大厅', this.actions.exit]);
        const gap = 176;
        const start = -gap * (actions.length - 1) / 2;
        actions.forEach(([text, action], index) => this.actionButton(this.actionsLayer, `Action_${index}`, text,
            new Vec3(start + gap * index, 0), 152, 58, () => this.run(action)));
        this.renderOperationButtons(snapshot);
    }

    private renderOperationButtons(snapshot: CD101RoomSnapshot): void {
        const bar = this.tableView?.getChildByName('OperateBtn');
        if (!bar) return;
        for (const child of [...bar.children]) {
            if (child.name.startsWith('CD101GangCandidate_')) {
                child.removeFromParent();
                child.destroy();
            }
        }
        for (const child of bar.children) child.active = false;
        const available = new Set(snapshot.legalActions ?? []);
        const actions: Array<{ name: string; run: () => Promise<void>; candidate?: CD101GangCandidate }> = [];
        if (this.localSeat >= 0 && snapshot.openingPhase === 'EXCHANGE'
            && !this.hasSubmittedOpening(snapshot, 'exchanges')) {
            actions.push({ name: 'ExchangeCard', run: () => this.actions.exchange(this.selectedCardValues(snapshot)) });
        } else if (snapshot.phase === 'PLAYING') {
            if (available.has('PENG')) actions.push({ name: 'Peng', run: () => this.actions.peng(this.pairTiles(snapshot, 2)) });
            if (available.has('GANG')) {
                for (const candidate of snapshot.gangCandidates) {
                    actions.push({ name: 'Gang', candidate,
                        run: () => this.actions.gang(candidate, snapshot.stateVersion) });
                }
            }
            if (available.has('HU')) {
                const selfDraw = snapshot.currentSeat === this.localSeat && snapshot.currentSeatHasDrawn;
                actions.push({ name: selfDraw ? 'ZiMo' : 'Hu', run: this.actions.hu });
            }
            if (available.has('PASS')) actions.push({ name: 'Pass', run: this.actions.pass });
            if (available.has('DISCARD')) {
                actions.push({ name: 'Play', run: () => this.actions.discard(this.selectedCardValues(snapshot)[0]) });
            }
        }
        const spacing = Math.min(132, 950 / Math.max(1, actions.length - 1));
        actions.forEach(({ name, run, candidate }, index) => {
            const template = bar.getChildByName(name);
            if (!template) return;
            const node = candidate ? instantiate(template) : template;
            if (candidate) {
                node.name = `CD101GangCandidate_${candidate.type}_${candidate.mahjongId}`;
                bar.addChild(node);
                const tileNode = node.getChildByName('Mahjong');
                if (tileNode) {
                    tileNode.active = candidate.type === 3 || candidate.type === 4;
                    if (tileNode.active) {
                        const frame = this.tileAtlas.getSpriteFrame(`1/hand/${candidate.mahjongId}`);
                        if (frame) {
                            const sprite = tileNode.getComponent(Sprite);
                            if (sprite) sprite.spriteFrame = frame;
                            const icon = tileNode.getChildByName('Icon');
                            if (icon) icon.active = false;
                        }
                    }
                }
            }
            const buttonNode = this.findButtonTemplate(node) ?? node;
            const button = buttonNode.getComponent(Button) ?? buttonNode.addComponent(Button);
            button.clickEvents = [];
            buttonNode.off(Button.EventType.CLICK);
            buttonNode.on(Button.EventType.CLICK, () => this.run(run), this);
            node.setPosition(new Vec3((index - (actions.length - 1) / 2) * spacing, 0));
            node.active = true;
        });
        bar.active = actions.length > 0;
    }

    private pairTiles(snapshot: CD101RoomSnapshot, count: number): readonly number[] {
        const cards = snapshot.seats[String(this.localSeat)]?.cards ?? [];
        const matching = cards.filter(tile => tile === snapshot.lastDiscard).slice(0, count);
        if (matching.length !== count) throw new Error('手牌不足，无法碰或杠');
        return matching;
    }

    private hasSubmittedOpening(snapshot: CD101RoomSnapshot, choice: 'exchanges' | 'missingSuits'): boolean {
        return this.localSeat >= 0 && snapshot.openingSelections?.[choice]?.[String(this.localSeat)] === true;
    }

    private async loadTablePrefab(): Promise<void> {
        try {
            const prefab = await new Promise<Prefab>((resolve, reject) => {
                assetManager.loadBundle('games-mahjong', (bundleError, bundle) => {
                    if (bundleError || !bundle) {
                        reject(bundleError ?? new Error('games-mahjong bundle unavailable'));
                        return;
                    }
                    bundle.load('Common/Prefab/ChessMahjongRoomWindow', Prefab, (error, asset) => {
                        if (error || !asset) reject(error ?? new Error('ChessMahjongRoomWindow unavailable'));
                        else resolve(asset);
                    });
                });
            });
            if (!this.root.isValid) return;
            const table = instantiate(prefab);
            this.setLayerRecursively(table);
            table.getComponent(Widget)?.destroy();
            const hostSize = this.commonRoom.getComponent(UITransform)?.contentSize;
            const tableSize = table.getComponent(UITransform)?.contentSize;
            if (hostSize && tableSize && tableSize.width > 0 && tableSize.height > 0) {
                const scale = Math.min(hostSize.width / tableSize.width, hostSize.height / tableSize.height);
                table.setScale(scale, scale, 1);
            }
            const operationBar = table.getChildByName('OperateBtn');
    if (operationBar) {
      operationBar.getComponent(Widget)?.destroy();
      operationBar.setPosition(new Vec3(0, -145, 0));
      operationBar.active = false;
    }
            this.tableView = table;
      this.commonRoom.addChild(table);
      table.setSiblingIndex(this.commonRoom.children.length - 1);
      assetManager.loadBundle('games-mahjong', (backgroundBundleError, backgroundBundle) => {
        if (backgroundBundleError || !backgroundBundle) return;
        backgroundBundle.load('Common/Prefab/Room_2D/GameHzmjCommonSceneLayerBackgroundLayer', Prefab, (backgroundError, backgroundPrefab) => {
          if (backgroundError || !backgroundPrefab || !this.commonRoom?.isValid) return;
          const background = instantiate(backgroundPrefab);
          this.commonRoom.addChild(background);
          background.setSiblingIndex(0);
          background.setScale(table.scale);
        });
      });
            for (const name of ['Btn', 'RoomInfo']) {
                this.commonRoom.getChildByName(name)?.setSiblingIndex(this.commonRoom.children.length - 1);
            }
            if (this.snapshot) this.render(this.snapshot, this.localPlayerId);
        } catch (error) {
            this.showError(`桌面预制体加载失败：${error instanceof Error ? error.message : String(error)}`);
        }
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

    private actionButton(parent: Node, name: string, text: string, position: Vec3,
        width: number, height: number, action: () => void): Node {
        return this.button(parent, name, text, position, width, height, action);
    }

    private run(action: () => Promise<void>): void {
        try {
            void action().catch(error => this.showError(error instanceof Error ? error.message : String(error)));
        } catch (error) {
            this.showError(error instanceof Error ? error.message : String(error));
        }
    }

    private toggleTile(index: number): void {
        if (this.selectedTiles.has(index)) this.selectedTiles.delete(index);
        else if (this.selectedTiles.size < 3) this.selectedTiles.add(index);
    }

    private selectedCardValues(snapshot: CD101RoomSnapshot): readonly number[] {
        const own = this.localSeat >= 0 ? snapshot.seats[String(this.localSeat)] : undefined;
        if (!own) return [];
        return [...this.selectedTiles].sort((a, b) => a - b)
            .map(index => own.cards[index]).filter((tile): tile is number => Number.isSafeInteger(tile));
    }

    private findLocalSeat(snapshot: CD101RoomSnapshot, playerId: number): number {
        for (const [seat, data] of Object.entries(snapshot.seats)) {
            if (String(data.playerId) === String(playerId)) return Number(seat);
        }
        return -1;
    }

    private layer(parent: Node, name: string): Node {
        const node = new Node(name); node.layer = Layers.Enum.UI_2D; parent.addChild(node); return node;
    }

    private setLayerRecursively(node: Node): void {
        node.layer = Layers.Enum.UI_2D;
        for (const child of node.children) this.setLayerRecursively(child);
    }

    private commonLabel(path: string, text: string): void {
        const label = this.commonRoom.getChildByPath(path)?.getComponent(Label);
        if (label) label.string = text;
    }

    private panel(parent: Node, name: string, width: number, height: number, color: Color): Node {
        const node = this.layer(parent, name);
        node.addComponent(UITransform).setContentSize(width, height);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = color;
        graphics.roundRect(-width / 2, -height / 2, width, height, 18);
        graphics.fill();
        return node;
    }

    private label(parent: Node, name: string, text: string, size: number, position: Vec3,
        width: number, height: number, color = new Color(255, 255, 255, 255)): Label {
        const node = this.layer(parent, name); node.setPosition(position);
        node.addComponent(UITransform).setContentSize(width, height);
        const label = node.addComponent(Label);
        label.string = text; label.fontSize = size; label.lineHeight = Math.ceil(size * 1.25);
        label.color = color; label.horizontalAlign = HorizontalTextAlignment.CENTER;
        label.verticalAlign = VerticalTextAlignment.CENTER; label.overflow = Label.Overflow.SHRINK;
        return label;
    }

    private button(parent: Node, name: string, text: string, position: Vec3, width: number, height: number,
        action: () => void, color = new Color(28, 128, 110, 255)): Node {
        const node = this.panel(parent, name, width, height, color);
        node.setPosition(position);
        node.addComponent(Button);
        this.label(node, 'Label', text, 22, Vec3.ZERO, width - 12, height - 8, new Color(255, 255, 255, 255));
        node.on(Button.EventType.CLICK, action, this);
        return node;
    }

    private tileName(tile: number): string {
        const value = tile % 10;
        return tile < 20 ? `${value}万` : tile < 30 ? `${value}条` : `${value}筒`;
    }

    private score(value: number): string { return value > 0 ? `+${value}` : String(value); }
}
