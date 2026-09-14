import { Button, instantiate, Label, Layout, Node, Prefab, resources, Sprite, SpriteFrame, UITransform } from 'cc';
import { loadHzmjPrefab } from './HzmjPrefabLoader';
import type { ProtocolClient } from '../../../../../../../Common/Code/Runtime/network/ProtocolClient';

interface ReplayChunk { id?: unknown; playBackNum?: unknown; msg?: unknown; }
interface ReplayMetadata {
    playerList?: unknown;
    dPos?: unknown;
    roomKey?: unknown;
    setID?: unknown;
    roomID?: unknown;
    tabId?: unknown;
    setCount?: unknown;
}

interface ReplayFrame { name?: unknown; res?: unknown; setPosCard?: unknown; }

/** Native HZMJ replay timeline using the original chunked playback protocol. */
export class HzmjReplayController {
    private root: Node | null = null;
    private frames: ReplayFrame[] = [];
    private chunks: string[] = [];
    private expectedChunks = 0;
    private cursor = 0;
    private paused = false;
    private timer = 0;
    private roomId = 0;
    private tabId = 0;
    private disposeChunk: (() => void) | null = null;
    private generation = 0;
    private roundRequestPending = false;

    public constructor(
        private readonly parent: Node,
        private readonly client: ProtocolClient,
        private readonly message: (text: string) => void,
        private readonly exit: () => void,
    ) {}

    public async open(playBackCode: string): Promise<void> {
        const code = playBackCode.trim();
        if (!code) throw new Error('红中麻将回放码为空');
        this.destroyView();
        const generation = ++this.generation;
        const prefab = await this.loadPrefab('GameHzmjUiHZMJVideo');
        if (generation !== this.generation) return;
        const root = instantiate(prefab);
        root.name = 'HZMJVideo';
        this.parent.addChild(root);
        this.root = root;
        this.bindControls(root);
        this.disposeChunk = this.client.on('SPlayer_PlayBackData', (packet) => this.onChunk(packet as ReplayChunk));
        try {
            const metadata = await this.client.request<ReplayMetadata>('game.CPlayerPlayBack', {
                playBackCode: code,
                chekcPlayBackCode: false,
            });
            if (generation !== this.generation) return;
            this.applyMetadata(metadata);
        } catch (error: unknown) {
            this.setActive(root, 'UIMessageNoExist', true);
            throw error;
        }
    }

    public destroy(): void {
        this.generation += 1;
        this.destroyView();
    }

    private onChunk(packet: ReplayChunk): void {
        const index = Number(packet.id);
        const total = Number(packet.playBackNum);
        if (!Number.isSafeInteger(index) || index < 0 || !Number.isSafeInteger(total) || total <= 0) return;
        this.expectedChunks = total;
        this.chunks[index] = String(packet.msg ?? '');
        if (this.chunks.filter((chunk) => typeof chunk === 'string').length !== total) return;
        try {
            const parsed = JSON.parse(this.chunks.slice(0, total).join('')) as { playbackList?: unknown };
            if (!Array.isArray(parsed.playbackList)) throw new Error('回放帧列表无效');
            this.frames = parsed.playbackList as ReplayFrame[];
            this.cursor = 0;
            this.paused = false;
            this.renderFrame();
            this.startTimer();
        } catch (error: unknown) {
            this.message(error instanceof Error ? error.message : '红中麻将回放数据解析失败');
        }
    }

    private applyMetadata(packet: ReplayMetadata): void {
        this.roomId = Number(packet.roomID ?? 0);
        this.tabId = Number(packet.tabId ?? 0);
        const players = this.parsePlayers(packet.playerList);
        this.setLabel('room_data/label_player_num', `${players.length}人场`);
        this.setLabel('room_data/label_player_ju', `局数：${Number(packet.setID ?? 0)}/${Number(packet.setCount ?? 0)}`);
        this.setLabel('room_data/label_player_roomkey', `房间号：${String(packet.roomKey ?? '')}`);
    }

    private bindControls(root: Node): void {
        this.bind(root, 'btn_return', () => this.exit());
        this.bind(root, 'btnSure', () => this.exit());
        this.bind(root, 'btn_play', () => { this.paused = false; this.syncPlayButtons(); });
        this.bind(root, 'btn_pause', () => { this.paused = true; this.syncPlayButtons(); });
        this.bind(root, 'btn_back', () => { this.paused = true; this.cursor = Math.max(0, this.cursor - 1); this.renderFrame(); });
        this.bind(root, 'btn_forward', () => { this.paused = true; this.cursor = Math.min(this.frames.length - 1, this.cursor + 1); this.renderFrame(); });
        this.bind(root, 'btn_last', () => { void this.changeRound(-1); });
        const nextButtons = this.findAll(root, 'btn_next');
        const roundNext = nextButtons.length ? nextButtons[nextButtons.length - 1] : undefined;
        if (roundNext) this.bindNode(roundNext, () => { void this.changeRound(1); });
        this.syncPlayButtons();
    }

    private async changeRound(delta: number): Promise<void> {
        if (this.roundRequestPending) return;
        const target = this.tabId + delta;
        if (target < 1) {
            this.message('当前已经是第一局');
            return;
        }
        const generation = this.generation;
        this.roundRequestPending = true;
        this.setRoundButtonsInteractable(false);
        try {
            const packet = await this.client.request<{ gameId?: unknown; playBackCode?: unknown }>('hzmj.CHZMJGetPlayBackCode', {
                roomId: this.roomId, tabId: target,
            });
            if (generation !== this.generation) return;
            if (Number(packet.gameId) !== 0) throw new Error('获取到的回放不属于红中麻将');
            this.tabId = target;
            await this.open(String(packet.playBackCode ?? ''));
        } catch (error: unknown) {
            if (generation === this.generation) this.message(error instanceof Error ? error.message : '获取相邻局回放失败');
        } finally {
            if (generation === this.generation) {
                this.roundRequestPending = false;
                this.setRoundButtonsInteractable(true);
            }
        }
    }

    private setRoundButtonsInteractable(interactable: boolean): void {
        if (!this.root) return;
        const nodes = [...this.findAll(this.root, 'btn_last'), ...this.findAll(this.root, 'btn_next')];
        for (const node of nodes) {
            const button = node.getComponent(Button);
            if (button) button.interactable = interactable;
        }
    }

    private renderFrame(): void {
        if (!this.root || !this.frames.length) return;
        this.cursor = Math.max(0, Math.min(this.cursor, this.frames.length - 1));
        const frame = this.frames[this.cursor];
        this.setLabel('playinfo', `${this.cursor + 1}/${this.frames.length}`);
        this.root.emit('legacy-hzmj-replay-frame', {
            index: this.cursor,
            name: String(frame?.name ?? ''),
            body: frame?.res,
            setPosCard: frame?.setPosCard,
        });
        void this.renderCards(frame?.setPosCard);
        this.renderOperation(frame);
    }

    private startTimer(): void {
        if (this.timer) globalThis.clearInterval(this.timer);
        this.timer = globalThis.setInterval(() => {
            if (this.paused || !this.frames.length) return;
            if (this.cursor >= this.frames.length - 1) {
                this.paused = true;
                this.syncPlayButtons();
                return;
            }
            this.cursor += 1;
            this.renderFrame();
        }, 1000);
    }

    private async renderCards(value: unknown): Promise<void> {
        if (!Array.isArray(value) || !this.root) return;
        const generation = this.generation;
        for (const raw of value) {
            if (!raw || typeof raw !== 'object') continue;
            const setPos = raw as Record<string, unknown>;
            const pos = Number(setPos.posID ?? setPos.pos ?? -1);
            if (!Number.isSafeInteger(pos) || pos < 0 || pos > 3) continue;
            const seat = this.root.getChildByName(`sp_seat0${pos + 1}`);
            if (!seat) continue;
            let hand = seat.getChildByName('NativeReplayHand');
            if (!hand) {
                hand = new Node('NativeReplayHand');
                const transform = hand.addComponent(UITransform);
                transform.setContentSize(720, 80);
                const layout = hand.addComponent(Layout);
                layout.type = Layout.Type.HORIZONTAL;
                layout.resizeMode = Layout.ResizeMode.CONTAINER;
                layout.spacingX = -18;
                seat.addChild(hand);
            }
            hand.removeAllChildren();
            const cards = this.cardList(setPos.shouCard);
            const drawn = Number(setPos.handCard ?? 0);
            if (drawn > 0) cards.push(drawn);
            for (const cardId of cards) {
                const card = new Node(`replay_card_${cardId}`);
                card.addComponent(UITransform).setContentSize(52, 72);
                const sprite = card.addComponent(Sprite);
                hand.addChild(card);
                try {
                    const frame = await this.loadCardFrame(cardId);
                    if (generation !== this.generation || !card.isValid) return;
                    sprite.spriteFrame = frame;
                } catch (error: unknown) {
                    this.message(error instanceof Error ? error.message : '回放牌面加载失败');
                }
            }
        }
    }

    private renderOperation(frame: ReplayFrame | undefined): void {
        if (!this.root || !frame?.res || typeof frame.res !== 'object') return;
        const name = String(frame.name ?? '');
        if (!name.includes('MJ_PosOpCard')) return;
        const result = frame.res as Record<string, unknown>;
        const pos = Number(result.pos ?? result.posID ?? -1);
        const cardId = Number(result.opCard ?? result.cardID ?? 0);
        if (!Number.isSafeInteger(pos) || pos < 0 || pos > 3 || cardId <= 0) return;
        const seat = this.root.getChildByName(`sp_seat0${pos + 1}`);
        const target = seat ? this.find(seat, 'showcard') : null;
        if (!target) return;
        const sprite = target.getComponent(Sprite) ?? target.addComponent(Sprite);
        void this.loadCardFrame(cardId).then((asset) => {
            if (target.isValid) { sprite.spriteFrame = asset; target.active = true; }
        }).catch((error: unknown) => this.message(error instanceof Error ? error.message : '回放出牌牌面加载失败'));
    }

    private cardList(value: unknown): number[] {
        return Array.isArray(value)
            ? value.map(Number).filter((card) => Number.isSafeInteger(card) && card > 0)
            : [];
    }

    private loadCardFrame(cardId: number): Promise<SpriteFrame> {
        const name = String(Math.floor(cardId / 100)).padStart(2, '0');
        const path = `legacy-ui/hzmj-source/texture/game/majiang/self2d/show/hh_face_li_${name}/spriteFrame`;
        return new Promise((resolve, reject) => resources.load(path, SpriteFrame,
            (error, frame) => error ? reject(error) : resolve(frame)));
    }

    private syncPlayButtons(): void {
        if (!this.root) return;
        this.setActive(this.root, 'btn_play', this.paused);
        this.setActive(this.root, 'btn_pause', !this.paused);
    }

    private destroyView(): void {
        this.roundRequestPending = false;
        if (this.timer) globalThis.clearInterval(this.timer);
        this.timer = 0;
        this.disposeChunk?.();
        this.disposeChunk = null;
        this.root?.destroy();
        this.root = null;
        this.frames = [];
        this.chunks = [];
        this.expectedChunks = 0;
        this.cursor = 0;
    }

    private parsePlayers(value: unknown): unknown[] {
        if (Array.isArray(value)) return value;
        if (typeof value !== 'string' || !value) return [];
        try { return JSON.parse(value) as unknown[]; } catch { return []; }
    }

    private bind(root: Node, name: string, listener: () => void): void {
        const node = this.find(root, name);
        if (node) this.bindNode(node, listener);
    }

    private bindNode(node: Node, listener: () => void): void {
        node.getComponent(Button) ?? node.addComponent(Button);
        node.on(Button.EventType.CLICK, listener, this);
    }

    private setLabel(path: string, value: string): void {
        const node = this.root?.getChildByPath(path);
        const label = node?.getComponent(Label);
        if (label) label.string = value;
    }

    private setActive(root: Node, name: string, active: boolean): void {
        const node = this.find(root, name);
        if (node) node.active = active;
    }

    private find(root: Node, name: string): Node | null {
        if (root.name === name) return root;
        for (const child of root.children) {
            const match = this.find(child, name);
            if (match) return match;
        }
        return null;
    }

    private findAll(root: Node, name: string, result: Node[] = []): Node[] {
        if (root.name === name) result.push(root);
        for (const child of root.children) this.findAll(child, name, result);
        return result;
    }

    private loadPrefab(path: string): Promise<Prefab> {
        return loadHzmjPrefab(path);
    }
}
