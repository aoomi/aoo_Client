import { Button, instantiate, Label, Node, Prefab, UITransform, Vec3 } from 'cc';
import { AssetLoader } from '../../../../../../../Common/Code/UI/Infrastructure';
import { CommonHeadController } from '../../../../../../../Common/Code/UI/CommonHeadController';
import { COMMON_ASSET_BUNDLE, COMMON_HEAD_ASSET } from '../../../../../../../Common/Code/Runtime/ui/CommonPrefabRegistry';

export type PdkPlayerCount = 2 | 3 | 4;
export interface PdkSeatEntry { readonly dataSeat: number; readonly physicalSlot: number; }
export interface PdkSeatPlayer {
    readonly pid?: number;
    readonly headImageUrl?: string;
    readonly name?: string;
    readonly nickName?: string;
    readonly displayName?: string;
    readonly totalScore?: number;
    readonly point?: number;
    readonly clubCent?: number | string;
    readonly roomReady?: boolean;
    readonly isReady?: boolean;
    readonly isContinue?: boolean;
    readonly trusteeship?: boolean;
    readonly isLostConnect?: boolean;
    readonly isShowLeave?: boolean;
    readonly ip?: string;
    readonly IP?: string;
    readonly ipAddress?: string;
    readonly gps?: string;
    readonly location?: string;
    readonly address?: string;
}
export interface PdkHeadContext { readonly ownerId?: number; readonly showReady?: boolean; }

export interface PdkSeatLayoutProfile {
    readonly playerCount: PdkPlayerCount;
    readonly localDataSeat: number;
    readonly activePhysicalSlots: readonly number[];
    readonly entries: readonly PdkSeatEntry[];
    physicalSlotFor(dataSeat: number): number;
}

const ACTIVE_SLOTS: Readonly<Record<PdkPlayerCount, readonly number[]>> = Object.freeze({
    2: Object.freeze([0, 2]),
    3: Object.freeze([0, 1, 3]),
    4: Object.freeze([0, 1, 2, 3]),
});

export function requirePdkPlayerCount(value: unknown): PdkPlayerCount {
    const playerCount = Number(value);
    if (playerCount !== 2 && playerCount !== 3 && playerCount !== 4) throw new Error(`跑得快权威人数无效: ${String(value)}`);
    return playerCount;
}

export function createSeatEntries(playerCountValue: unknown, localSeatValue: unknown): readonly PdkSeatEntry[] {
    const playerCount = requirePdkPlayerCount(playerCountValue);
    const localSeat = Number(localSeatValue);
    if (!Number.isInteger(localSeat) || localSeat < 0 || localSeat >= playerCount) throw new Error(`跑得快本地座位无效: ${localSeat}`);
    return Array.from({ length: playerCount }, (_, dataSeat) => ({
        dataSeat,
        physicalSlot: ACTIVE_SLOTS[playerCount][(dataSeat - localSeat + playerCount) % playerCount],
    }));
}

/**
 * 数据座位必须围绕本机玩家旋转后再映射到固定物理挂点，否则重连或人数切换时，
 * 同一个玩家会在不同客户端落到不同方向，公开出牌区和倒计时也会随之错位。
 */
export function createPdkSeatLayoutProfile(playerCountValue: unknown, localSeatValue: unknown): PdkSeatLayoutProfile {
    const playerCount = requirePdkPlayerCount(playerCountValue);
    const localDataSeat = Number(localSeatValue);
    const entries = Object.freeze([...createSeatEntries(playerCount, localDataSeat)]);
    const physicalByDataSeat = new Map(entries.map((entry) => [entry.dataSeat, entry.physicalSlot]));
    return Object.freeze({
        playerCount,
        localDataSeat,
        activePhysicalSlots: ACTIVE_SLOTS[playerCount],
        entries,
        physicalSlotFor(dataSeat: number): number {
            const physicalSlot = physicalByDataSeat.get(dataSeat);
            if (physicalSlot === undefined) throw new Error(`跑得快数据座位越界: ${dataSeat}/${playerCount}`);
            return physicalSlot;
        },
    });
}

export class SeatPresenter {
    private readonly assets = new AssetLoader();
    private readonly heads = new Map<number, Node>();
    private readonly headPlayerIds = new Map<number, number>();
    private readonly headRevisions = new Map<number, number>();
    private generation = 0;

    public constructor(
        private readonly root: Node,
        private readonly onHeadClick: (dataSeat: number) => void = () => undefined,
    ) {}

    public apply(playerCount: PdkPlayerCount, localSeat: number, players: Readonly<Record<number, PdkSeatPlayer>>): readonly PdkSeatEntry[] {
        const entries = createSeatEntries(playerCount, localSeat);
        const active = new Set(entries.map((entry) => entry.physicalSlot));
        for (let slot = 0; slot < 4; slot += 1) this.seat(slot).active = active.has(slot);
        for (const entry of entries) {
            const seat = this.seat(entry.physicalSlot);
            seat.active = true;
            if (Number(players[entry.dataSeat]?.pid ?? 0) <= 0) this.clearHead(entry.dataSeat, entry.physicalSlot);
        }
        return entries;
    }

    public async renderHead(dataSeat: number, physicalSlot: number, player: PdkSeatPlayer = {}, context: PdkHeadContext = {}): Promise<Node | null> {
        const playerId = Number(player.pid ?? 0);
        if (playerId <= 0) {
            this.clearHead(dataSeat, physicalSlot);
            return null;
        }
        const generation = this.generation;
        const revision = (this.headRevisions.get(dataSeat) ?? 0) + 1;
        this.headRevisions.set(dataSeat, revision);
        const seat = this.seat(physicalSlot);
        const mount = this.child(seat, 'Head');
        mount.active = true;
        let head = this.heads.get(dataSeat);
        if (!head?.isValid) {
            const bundle = await this.assets.bundle(COMMON_ASSET_BUNDLE);
            const prefab = await this.assets.load(COMMON_HEAD_ASSET, Prefab, bundle);
            if (generation !== this.generation || revision !== this.headRevisions.get(dataSeat)
                || !this.root.isValid || !mount.isValid) return null;
            const created = instantiate(prefab);
            created.getComponent(CommonHeadController)?.useVariant('Game');
            for (const child of [...mount.children]) {
                if (child.name === 'CommonHead') child.destroy();
            }
            seat.getChildByName('HeadButton')?.destroy();
            mount.addChild(created);
            const mountSize = mount.getComponent(UITransform)?.contentSize;
            const headTransform = created.getComponent(UITransform);
            if (mountSize && headTransform && headTransform.contentSize.width > 0 && headTransform.contentSize.height > 0) {
                const scale = Math.min(mountSize.width / headTransform.contentSize.width, mountSize.height / headTransform.contentSize.height);
                created.setScale(new Vec3(scale, scale, 1));
            }
            this.heads.set(dataSeat, created);
            const headButton = new Node('HeadButton');
            headButton.layer = mount.layer;
            headButton.addComponent(UITransform).setContentSize(mountSize?.width ?? 80, mountSize?.height ?? 80);
            headButton.addComponent(Button).transition = Button.Transition.NONE;
            headButton.on(Button.EventType.CLICK, () => this.onHeadClick(dataSeat), this);
            headButton.setPosition(mount.position);
            // 本机手牌触摸区覆盖头像下半部；按钮必须作为座位最后一个子节点，才能优先接收头像点击。
            seat.addChild(headButton);
            head = created;
        }
        if (!head) throw new Error(`公共头像实例化失败: ${dataSeat}`);
        const previousPlayerId = this.headPlayerIds.get(dataSeat);
        if (previousPlayerId !== undefined && previousPlayerId !== playerId) {
            head.getComponent(CommonHeadController)?.hideTransientEffects();
        }
        this.headPlayerIds.set(dataSeat, playerId);
        this.applyHeadState(head, player, context);
        await head.getComponent(CommonHeadController)?.showPlayerAvatar(playerId, String(player.headImageUrl ?? ''));
        return head;
    }

    /** 权威座位已空时必须销毁旧头像，避免异步加载完成后把离房玩家重新挂回座位。 */
    public clearHead(dataSeat: number, physicalSlot: number): void {
        this.headRevisions.set(dataSeat, (this.headRevisions.get(dataSeat) ?? 0) + 1);
        const seat = this.seat(physicalSlot);
        const mount = this.child(seat, 'Head');
        mount.active = false;
        seat.getChildByName('HeadButton')?.destroy();
        const head = this.heads.get(dataSeat);
        if (head?.isValid) {
            head.getComponent(CommonHeadController)?.hideTransientEffects();
            head.destroy();
        }
        this.heads.delete(dataSeat);
        this.headPlayerIds.delete(dataSeat);
    }

    public showQuickText(dataSeat: number, text: string): void {
        this.controller(dataSeat)?.showQuickText(text);
    }

    public hideQuickText(dataSeat: number): void {
        this.controller(dataSeat)?.hideQuickText();
    }

    public showEmoji(dataSeat: number, emojiId: number): Promise<void> {
        return this.controller(dataSeat)?.showEmoji(emojiId) ?? Promise.resolve();
    }

    public hideEmoji(dataSeat: number): void {
        this.controller(dataSeat)?.hideEmoji();
    }

    public showVoice(dataSeat: number): void {
        this.controller(dataSeat)?.showVoice();
    }

    public hideVoice(dataSeat: number): void {
        this.controller(dataSeat)?.hideVoice();
    }

    public clear(): void {
        this.generation += 1;
        this.heads.clear();
        this.headPlayerIds.clear();
        this.headRevisions.clear();
    }
    public head(dataSeat: number): Node | null {
        const head = this.heads.get(dataSeat);
        return head?.isValid ? head : null;
    }
    public hideReadyStates(): void {
        for (const head of this.heads.values()) {
            if (!head?.isValid) continue;
            head.getComponent(CommonHeadController)?.showReady(false);
            this.active(head, 'icon_ok', false);
        }
    }
    public seat(slot: number): Node { return this.child(this.child(this.root, 'Players'), `Play_${slot}`); }

    private applyHeadState(head: Node, player: PdkSeatPlayer, context: PdkHeadContext): void {
        const pid = Number(player.pid ?? 0);
        const displayName = this.displayName(player, pid);
        this.text(head, 'Game/Head/PlayerInfo/Lb_PlayerName', displayName);
        this.text(head, 'Game/Head/PlayerInfo/Lb_PlayerScore', pid > 0 ? String(player.totalScore ?? player.point ?? 0) : '');
        this.active(head, 'Game/Head/RoundAvatar/Mask/Offline', Boolean(player.isLostConnect));
        this.active(head, 'Game/Head/RoundAvatar/Mask/LeftRoom', Boolean(player.isShowLeave));
        this.active(head, 'Game/Head/IdentityStatus/Icon_Banker', false);
        this.active(head, 'Game/Head/IdentityStatus/Icon_RoomOwner', Boolean(context.ownerId && pid === context.ownerId));
        const controller = head.getComponent(CommonHeadController);
        if (!controller) throw new Error('CommonHead 缺少 CommonHeadController 组件');
        controller.showReady(Boolean(context.showReady && (player.roomReady || player.isReady)));
        this.active(head, 'icon_ok', Boolean(player.isContinue));
        this.active(head, 'Game/GameStatus/Img_AutoPlay', Boolean(player.trusteeship));
        this.active(head, 'Game/GameStatus/Btn_Out', false);
    }

    private displayName(player: PdkSeatPlayer, pid: number): string {
        for (const value of [player.name, player.nickName, player.displayName]) {
            const text = String(value ?? '').trim();
            if (text && text !== '0' && text.toLowerCase() !== 'label') return text;
        }
        return pid > 0 ? `玩家${pid}` : '';
    }

    private controller(dataSeat: number): CommonHeadController | null {
        const head = this.heads.get(dataSeat);
        if (!head?.isValid) return null;
        const controller = head.getComponent(CommonHeadController);
        if (!controller) throw new Error('CommonHead 缺少 CommonHeadController 组件');
        return controller;
    }

    private text(root: Node, path: string, value: string): void {
        const label = this.node(root, path)?.getComponent(Label);
        if (label) label.string = value;
    }

    private active(root: Node, path: string, active: boolean): void {
        const node = this.node(root, path);
        if (node) node.active = active;
    }

    private node(root: Node, path: string): Node | null {
        let current: Node | null = root;
        for (const segment of path.split('/').filter(Boolean)) current = current?.getChildByName(segment) ?? null;
        return current;
    }

    private child(parent: Node, name: string): Node {
        const node = parent.getChildByName(name);
        if (!node) throw new Error(`PDK_CommonRoom 座位节点缺失: ${name}`);
        return node;
    }
}
