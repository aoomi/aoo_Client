import { assetManager, Button, Color, instantiate, isValid, Label, Layout, Node, Prefab, UITransform } from 'cc';
import type { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { CardPresenter } from '../../../Games/Poker/PDK/Common/Code/Runtime/Room/CardPresenter';
import { createSeatEntries, SeatPresenter } from '../../../Games/Poker/PDK/Common/Code/Runtime/Room/SeatPresenter';
import { PdkAnimationResolver } from '../../../Games/Poker/PDK/Common/Code/Runtime/PdkAnimationResolver';
import type { ReplayGateway } from '../../../Common/Code/Runtime/Replay/ReplayGateway';

export interface PdkReplayTarget {
    readonly roomId: string;
    readonly setId: string;
}

interface ReplayEvent {
    readonly sequence?: number;
    readonly messageId?: string;
    readonly playVersion?: string;
    readonly payload?: string;
}

interface ReplayChunk {
    readonly events?: readonly ReplayEvent[];
    readonly nextSequence?: number;
    readonly hasMore?: boolean;
}

interface ReplaySeat {
    readonly playerId?: number | string;
    readonly name?: string;
    readonly totalScore?: number;
    readonly roundScore?: number;
    readonly cards?: readonly number[];
    readonly remainingCards?: readonly number[];
    readonly cardCount?: number;
    readonly headImageUrl?: string;
}

interface ReplaySnapshot {
    readonly family?: string;
    readonly roomId?: number | string;
    readonly roundNo?: number;
    readonly roundLimit?: number;
    readonly phase?: string;
    readonly currentSeat?: number;
    readonly serverEpochMillis?: number;
    readonly ruleOptions?: Readonly<Record<string, unknown>>;
    readonly currentTrick?: { readonly seat?: number; readonly cards?: readonly number[] };
    readonly playHistory?: ReadonlyArray<{
        readonly seat?: number;
        readonly cards?: readonly number[];
        readonly playIndex?: number;
        readonly playedAtEpochMillis?: number;
        readonly type?: string;
    }>;
    readonly seats?: Readonly<Record<string, ReplaySeat>>;
}

interface ReplayFrame {
    readonly sequence: number;
    readonly messageId: string;
    readonly playVersion: string;
    readonly snapshot: ReplaySnapshot;
    readonly playedAtEpochMillis?: number;
    readonly playIndex?: number;
    readonly playType?: string;
}

/** Plays ordered hall replay chunks inside the same PDK_CommonRoom used by live play. */
export class PdkReplayController {
    private form: LegacyForm | null = null;
    private readonly cards = new CardPresenter();
    private readonly animations = new PdkAnimationResolver(path => this.node(path));
    private seats: SeatPresenter | null = null;
    private readonly bindings: Array<{ node: Node; action: () => void }> = [];
    private frames: ReplayFrame[] = [];
    private frameIndex = 0;
    private paused = false;
    private timer = 0;
    private renderGeneration = 0;
    private target: PdkReplayTarget | null = null;
    private loadingKey = '';

    public constructor(
        private readonly forms: LegacyFormManager,
        private readonly api: ReplayGateway,
        private readonly playerId: string,
        private readonly reportError: (failure: unknown) => void,
    ) {}

    public install(): void {
        this.forms.register('pdk/AuthoritativeReplay', { zOrder: 20, modal: true, lifecycle: {
            onCreate: form => this.onCreate(form),
            onShow: (_form, target) => this.onShow(target as PdkReplayTarget),
            onClose: () => { this.loadingKey = ''; this.stop(); },
            onDestroy: () => this.destroy(),
        }});
    }

    public async open(target: PdkReplayTarget): Promise<void> {
        const roomId = String(target.roomId ?? ''), setId = String(target.setId ?? '');
        if (!/^\d+$/.test(roomId) || roomId === '0' || !/^\d+$/.test(setId)) {
            throw new Error('回放参数无效，请重新选择战绩');
        }
        const form = await this.forms.show('pdk/AuthoritativeReplay', { roomId, setId });
        if (!form) throw new Error('回放界面加载失败，请稍后重试');
    }

    public destroy(): void {
        this.stop();
        this.animations.destroy();
        this.seats?.clear();
        this.seats = null;
        for (const binding of this.bindings.splice(0)) {
            if (isValid(binding.node, true)) binding.node.off(Button.EventType.CLICK, binding.action, this);
        }
        this.form = null;
    }

    private onCreate(form: LegacyForm): void {
        this.form = form;
        this.seats = new SeatPresenter(form.node);
        this.prepareCommonRoom(form.node);
        void this.mountControls(form);
        this.ensureStatus(form.node);
    }

    private onShow(target: PdkReplayTarget): void {
        const key = `${target.roomId}:${target.setId}`;
        if (this.loadingKey === key) return;
        this.loadingKey = key;
        this.target = target;
        this.stop();
        this.frames = [];
        this.frameIndex = 0;
        this.setPaused(true);
        this.clearTable();
        this.status('正在加载权威回放…');
        void this.load(target);
    }

    private async load(target: PdkReplayTarget): Promise<void> {
        const generation = ++this.renderGeneration;
        try {
            const events: ReplayEvent[] = [];
            const cursors = new Set<number>();
            let afterSequence = 0;
            for (;;) {
                if (cursors.has(afterSequence)) throw new Error('回放分页游标重复');
                cursors.add(afterSequence);
                const chunk = await this.api.chunks(target.roomId, target.setId, afterSequence, 100) as ReplayChunk;
                if (generation !== this.renderGeneration || !this.form?.isShown()) return;
                if (Array.isArray(chunk.events)) events.push(...chunk.events);
                if (!chunk.hasMore) break;
                const next = Number(chunk.nextSequence ?? -1);
                if (!Number.isSafeInteger(next) || next <= afterSequence) throw new Error('回放分页数据无效');
                afterSequence = next;
            }
            this.frames = this.decode(events, target.setId);
            if (!this.frames.length) throw new Error('该战绩暂无可播放的权威状态');
            this.status(`房间 ${target.roomId} · 共 ${this.frames.length} 帧`);
            this.start();
        } catch (failure: unknown) {
            if (generation !== this.renderGeneration) return;
            this.status(this.message(failure, '回放加载失败，请稍后重试'), new Color(255, 205, 205, 255));
            this.reportError(failure);
        }
    }

    private decode(events: readonly ReplayEvent[], setId: string): ReplayFrame[] {
        const frames: ReplayFrame[] = [];
        const expectedRound = Number(setId) + 1;
        let previous = -1;
        for (const event of events) {
            const sequence = Number(event.sequence ?? -1);
            if (!Number.isSafeInteger(sequence) || sequence < previous) throw new Error('回放事件顺序无效');
            previous = sequence;
            const messageId = String(event.messageId ?? '');
            if (!messageId.endsWith('_resp') || !event.payload) continue;
            const snapshot = this.decodePayload(event.payload);
            if (snapshot.family && snapshot.family !== 'poker:pao-de-kuai') continue;
            if (!snapshot.seats || !Object.keys(snapshot.seats).length) continue;
            // A continue request can be persisted under the preceding set before
            // the recorder advances its set id. Never let that next-round empty
            // snapshot erase the selected round's final cards.
            if (Number.isSafeInteger(expectedRound) && expectedRound > 0
                && Number(snapshot.roundNo ?? expectedRound) !== expectedRound) continue;
            const playVersion = String(event.playVersion ?? '');
            const history = Array.isArray(snapshot.playHistory) ? snapshot.playHistory : [];
            if (this.isTerminalSnapshot(snapshot) && history.length > 0) {
                // The durable terminal projection contains the authoritative play
                // history even when intermediate network snapshots were compacted.
                // Expand it so opening a record starts an actual hand-by-hand replay.
                for (const play of [...history].sort((left, right) =>
                    Number(left.playIndex ?? 0) - Number(right.playIndex ?? 0))) {
                    const cards = this.cardsOf(play.cards);
                    if (!cards.length) continue;
                    frames.push({ sequence, messageId, playVersion,
                        playIndex: Number(play.playIndex ?? 0), playType: String(play.type ?? ''),
                        playedAtEpochMillis: Number(play.playedAtEpochMillis ?? snapshot.serverEpochMillis ?? 0), snapshot: {
                        ...snapshot,
                        phase: 'PLAYING',
                        currentTrick: { seat: Number(play.seat ?? 0), cards },
                    }});
                }
            } else {
                frames.push({ sequence, messageId, playVersion,
                    playedAtEpochMillis: Number(snapshot.serverEpochMillis ?? 0), snapshot });
            }
            if (this.isTerminalSnapshot(snapshot)) break;
        }
        return frames;
    }

    private isTerminalSnapshot(snapshot: ReplaySnapshot): boolean {
        return snapshot.phase === 'FINISHED' || snapshot.phase === 'ROUND_SETTLEMENT'
            || snapshot.phase === 'SETTLED' || snapshot.phase === 'DIRECT_WIN';
    }

    private decodePayload(payload: string): ReplaySnapshot {
        try {
            const binary = globalThis.atob(payload);
            const bytes = Uint8Array.from(binary, value => value.charCodeAt(0));
            return JSON.parse(new TextDecoder().decode(bytes)) as ReplaySnapshot;
        } catch { throw new Error('回放事件内容损坏'); }
    }

    private start(): void {
        this.stopTimer();
        this.setPaused(false);
        this.scheduleStep(0);
    }

    private stop(): void {
        this.renderGeneration += 1;
        this.stopTimer();
        this.setPaused(true);
    }

    private stopTimer(): void {
        if (this.timer) globalThis.clearTimeout(this.timer);
        this.timer = 0;
    }

    private setPaused(value: boolean): void {
        const changed = this.paused !== value;
        this.paused = value;
        if (value) this.stopTimer();
        else if (changed && this.frames.length && this.timer === 0) this.scheduleStep(0);
        this.active('control/btn_play', value);
        this.active('control/btn_pause', !value);
        this.form?.node.emit('authoritative-replay-state', {
            roomId: this.target?.roomId, setId: this.target?.setId,
            frameIndex: this.frameIndex, frameCount: this.frames.length, paused: value,
        });
    }

    private scheduleStep(delayMs: number): void {
        if (this.paused || this.timer !== 0 || !this.frames.length) return;
        this.timer = globalThis.setTimeout(() => {
            this.timer = 0;
            void this.step(1).then(() => {
                if (!this.paused && this.frameIndex < this.frames.length) this.scheduleStep(1200);
            });
        }, delayMs);
    }

    private async step(delta: number): Promise<void> {
        if (!this.frames.length) return;
        if (delta < 0) this.frameIndex = Math.max(0, this.frameIndex - 2);
        const frame = this.frames[this.frameIndex];
        if (!frame) { this.setPaused(true); return; }
        await this.render(frame);
        this.frameIndex += 1;
        const playedAt = this.playedAt(frame.playedAtEpochMillis, this.frameIndex);
        this.status(`房间 ${this.target?.roomId ?? '-'} · 第${Number(this.target?.setId ?? 0) + 1}局 · ${this.frameIndex}/${this.frames.length}${playedAt ? ` · 出牌时间 ${playedAt}` : ''}`);
        this.form?.node.emit('authoritative-replay-frame', {
            roomId: this.target?.roomId, setId: this.target?.setId,
            frameIndex: this.frameIndex, frameCount: this.frames.length,
            sequence: frame.sequence, messageId: frame.messageId,
        });
        if (this.frameIndex >= this.frames.length) this.setPaused(true);
    }

    private async render(frame: ReplayFrame): Promise<void> {
        const snapshot = frame.snapshot, seats = snapshot.seats ?? {};
        const seatEntries = Object.entries(seats).sort(([left], [right]) => Number(left) - Number(right));
        const own = seatEntries.find(([, seat]) => String(seat.playerId ?? '') === this.playerId);
        const clientSeat = Number(own?.[0] ?? seatEntries[0]?.[0] ?? 0);
        const layout = createSeatEntries(seatEntries.length, clientSeat);
        const physicalSlot = (dataSeat: number): number => layout.find(entry => entry.dataSeat === dataSeat)?.physicalSlot ?? 0;
        this.text('Panel/Bg_Wanfa/Labei_Wanfa', '跑得快 · 权威回放');
        this.text('BG/Room_Info/Room_Num', `${seatEntries.length}人场  局数:${snapshot.roundNo ?? 0}/${snapshot.roundLimit ?? '-'}`);
        this.text('BG/Room_Info/Room_Id', `房间号:${snapshot.roomId ?? this.target?.roomId ?? ''}`);
        for (let ui = 0; ui < 4; ui += 1) {
            this.active(`Players/Play_${ui}`, false);
            this.active(`Players/Play_${ui}/Clock`, false);
            this.clearOutCard(ui);
            this.node(`Players/Play_${ui}/Card/Table_Cards`)?.removeAllChildren();
            this.node(`Players/Play_${ui}/Card/Card_Layout`)?.removeAllChildren();
        }
        this.node('Players/Play_0/Card/Hand_Cards')?.removeAllChildren();
        for (const [key, seat] of seatEntries) {
            const dataSeat = Number(key);
            const ui = physicalSlot(dataSeat);
            this.active(`Players/Play_${ui}`, true);
            this.active(`Players/Play_${ui}/Head`, true);
            const hand = this.remainingHand(snapshot, dataSeat, frame.playIndex ?? 0, seat);
            const score = (frame.playIndex ?? 0) < this.maxPlayIndex(snapshot)
                ? Number(seat.totalScore ?? 0) - Number(seat.roundScore ?? 0)
                : Number(seat.totalScore ?? 0);
            await this.seats?.renderHead(dataSeat, ui, {
                pid: Number(seat.playerId ?? 0), name: String(seat.name ?? ''),
                headImageUrl: String(seat.headImageUrl ?? ''), totalScore: score,
            });
            const handPath = ui === 0 ? 'Players/Play_0/Card/Hand_Cards' : `Players/Play_${ui}/Card/Card_Layout`;
            if (hand.length) await this.renderCards(handPath, this.sortCards(hand));
            this.text(`Players/Play_${ui}/Head/Count`, `${hand.length}张`);
        }
        const lastPlay = Array.isArray(snapshot.playHistory) && snapshot.playHistory.length
            ? [...snapshot.playHistory].sort((left, right) => Number(left.playIndex ?? 0) - Number(right.playIndex ?? 0)).at(-1)
            : undefined;
        const trickCards = this.cardsOf(snapshot.currentTrick?.cards, lastPlay?.cards);
        if (trickCards.length) {
            const ui = physicalSlot(Number(snapshot.currentTrick?.seat ?? lastPlay?.seat ?? 0));
            await this.renderCards(`Players/Play_${ui}/Card/Out_Card`, trickCards);
            const animation = this.animationKey(frame.playType);
            if (animation) void this.animations.play(animation, ui).catch(this.reportError);
        }
        await this.renderTableCards(snapshot, layout, frame.playIndex ?? 0);
        this.renderTurnCountdown(snapshot, layout, frame.playIndex ?? 0);
    }

    private cardsOf(...values: ReadonlyArray<readonly number[] | undefined>): number[] {
        for (const value of values) if (Array.isArray(value)) return value.filter(card => Number.isInteger(card) && card > 0);
        return [];
    }

    private async renderCards(path: string, cards: readonly number[]): Promise<void> {
        const parent = this.node(path); if (!parent) return;
        if (path.endsWith('/Out_Card')) {
            this.cards.clearExcept(parent, ['Count']);
            const count = parent.getChildByName('Count');
            if (count) count.active = false;
        } else parent.removeAllChildren();
        parent.active = cards.length > 0;
        for (const card of cards) await this.cards.create(parent, card);
    }

    private clearTable(): void {
        this.node('Players/Play_0/Card/Hand_Cards')?.removeAllChildren();
        for (let index = 0; index < 4; index += 1) {
            this.clearOutCard(index);
            this.node(`Players/Play_${index}/Card/Table_Cards`)?.removeAllChildren();
            this.node(`Players/Play_${index}/Card/Card_Layout`)?.removeAllChildren();
        }
    }

    private remainingHand(snapshot: ReplaySnapshot, dataSeat: number, playIndex: number, seat: ReplaySeat): number[] {
        const cards = [...this.cardsOf(seat.remainingCards, seat.cards)];
        const history = Array.isArray(snapshot.playHistory) ? snapshot.playHistory : [];
        for (const play of history) {
            if (Number(play.seat ?? -1) !== dataSeat || Number(play.playIndex ?? 0) <= playIndex) continue;
            cards.push(...this.cardsOf(play.cards));
        }
        return cards;
    }

    private maxPlayIndex(snapshot: ReplaySnapshot): number {
        return Math.max(0, ...(snapshot.playHistory ?? []).map(play => Number(play.playIndex ?? 0)));
    }

    private async renderTableCards(snapshot: ReplaySnapshot, layout: readonly { dataSeat: number; physicalSlot: number }[], playIndex: number): Promise<void> {
        if (String(snapshot.ruleOptions?.playedCardVisibility ?? '') !== 'ALL_IN_ORDER') return;
        const history = Array.isArray(snapshot.playHistory) ? snapshot.playHistory : [];
        for (const play of history) {
            const index = Number(play.playIndex ?? 0);
            if (index <= 0 || index >= playIndex) continue;
            const slot = layout.find(entry => entry.dataSeat === Number(play.seat ?? -1))?.physicalSlot;
            if (slot === undefined) continue;
            const parent = this.node(`Players/Play_${slot}/Card/Table_Cards`);
            if (!parent) continue;
            parent.active = true;
            const outer = parent.getComponent(Layout) ?? parent.addComponent(Layout);
            outer.type = Layout.Type.HORIZONTAL; outer.resizeMode = Layout.ResizeMode.CONTAINER; outer.spacingX = 2;
            const hand = new Node(`Play_${index}`);
            hand.addComponent(UITransform).setContentSize(0, 0);
            const inner = hand.addComponent(Layout);
            inner.type = Layout.Type.HORIZONTAL; inner.resizeMode = Layout.ResizeMode.CONTAINER; inner.spacingX = -54;
            parent.addChild(hand);
            for (const card of this.cardsOf(play.cards)) await this.cards.create(hand, card);
            inner.updateLayout();
            inner.enabled = false;
            this.addPlayCount(hand, index);
            outer.updateLayout();
        }
    }

    private addPlayCount(hand: Node, playIndex: number): void {
        const template = this.node('Players/Play_0/Card/Out_Card/Count');
        const cards = hand.children.filter(child => !child.name.startsWith('PlayCount_'));
        const lastCard = cards[cards.length - 1];
        if (!template || !lastCard || playIndex <= 0) return;
        const count = instantiate(template);
        count.name = `PlayCount_${playIndex}`;
        count.active = true;
        hand.addChild(count);
        count.setPosition(lastCard.position.x, lastCard.position.y - 12, lastCard.position.z + 1);
        const label = count.getComponent(Label) ?? count.getChildByName('Label')?.getComponent(Label);
        if (label) label.string = String(playIndex);
    }

    private clearOutCard(slot: number): void {
        const parent = this.node(`Players/Play_${slot}/Card/Out_Card`);
        this.cards.clearExcept(parent, ['Count']);
        const count = parent?.getChildByName('Count');
        if (count) count.active = false;
    }

    private renderTurnCountdown(snapshot: ReplaySnapshot, layout: readonly { dataSeat: number; physicalSlot: number }[], playIndex: number): void {
        for (let slot = 0; slot < 4; slot += 1) this.active(`Players/Play_${slot}/Clock`, false);
        const history = Array.isArray(snapshot.playHistory) ? snapshot.playHistory : [];
        const next = [...history]
            .filter(play => Number(play.playIndex ?? 0) > playIndex)
            .sort((left, right) => Number(left.playIndex ?? 0) - Number(right.playIndex ?? 0))[0];
        if (!next) return;
        const slot = layout.find(entry => entry.dataSeat === Number(next.seat ?? -1))?.physicalSlot;
        if (slot === undefined) return;
        this.active(`Players/Play_${slot}/Clock`, true);
        this.text(`Players/Play_${slot}/Clock/Num`, '1');
    }

    private sortCards(cards: readonly number[]): number[] {
        const rank = (card: number): number => { const value = card & 0x0f; return value === 1 ? 16 : value === 2 ? 17 : value; };
        return [...cards].sort((left, right) => rank(right) - rank(left));
    }

    private animationKey(type: string | undefined): string {
        const keys: Readonly<Record<string, string>> = {
            BOMB: 'Bomb', STRAIGHT: 'Straight', CONSECUTIVE_PAIRS: 'ConsecutivePairs',
            TRIPLE: 'TripleWithoutAttachment', TRIPLE_WITH_SINGLE: 'TripleWithSingle',
            TRIPLE_WITH_SINGLES: 'TripleWithTwo', TRIPLE_WITH_PAIR: 'TripleWithPair',
            FOUR_WITH_SINGLE: 'FourWithSingle', FOUR_WITH_TWO: 'FourWithTwo',
            FOUR_WITH_PAIR: 'FourWithPair', FOUR_WITH_THREE: 'FourWithThree',
            AIRPLANE: 'Airplane', CONSECUTIVE_AIRPLANE: 'ConsecutiveAirplane',
        };
        return keys[String(type ?? '').toUpperCase()] ?? '';
    }

    private prepareCommonRoom(root: Node): void {
        for (const name of ['Btn', 'Gps', 'Panel']) {
            const node = root.getChildByName(name);
            if (node) node.active = name === 'Panel';
        }
    }

    private async mountControls(form: LegacyForm): Promise<void> {
        const bundle = assetManager.getBundle('records-ui') ?? await new Promise<import('cc').AssetManager.Bundle>((resolve, reject) => {
            assetManager.loadBundle('records-ui', (error, loaded) => error || !loaded ? reject(error ?? new Error('战绩资源加载失败')) : resolve(loaded));
        });
        const prefab = await new Promise<Prefab>((resolve, reject) => {
            bundle.load('Prefab/ReplayControls', Prefab, (error, loaded) => error || !loaded ? reject(error ?? new Error('回放控制条加载失败')) : resolve(loaded));
        });
        if (!form.isShown() || form.node.getChildByName('control')) return;
        const control = instantiate(prefab); control.name = 'control'; form.node.addChild(control);
        this.bind('control/btn_return', () => this.forms.close('pdk/AuthoritativeReplay'));
        this.bind('control/btn_play', () => this.setPaused(false));
        this.bind('control/btn_pause', () => this.setPaused(true));
        this.bind('control/btn_forward', () => { this.setPaused(true); void this.step(1); });
        this.bind('control/btn_back', () => { this.setPaused(true); void this.step(-1); });
        this.bind('control/btn_last', () => { void this.changeRound(-1); });
        this.bind('control/btn_next', () => { void this.changeRound(1); });
        this.setPaused(this.paused);
    }

    private ensureStatus(root: Node): void {
        if (root.getChildByName('runtime-authoritative-replay-status')) return;
        const node = new Node('runtime-authoritative-replay-status');
        node.setPosition(0, 294, 0);
        node.addComponent(UITransform).setContentSize(680, 38);
        const label = node.addComponent(Label);
        label.fontSize = 22; label.lineHeight = 28; label.color = Color.WHITE;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        root.addChild(node);
    }

    private async changeRound(delta: -1 | 1): Promise<void> {
        const current = Number(this.target?.setId ?? -1);
        const next = current + delta;
        if (!this.target || next < 0) { this.showMessage('当前已经是第一局'); return; }
        const target = { roomId: this.target.roomId, setId: String(next) };
        const previousTarget = this.target;
        const previousFrames = this.frames;
        const previousIndex = this.frameIndex;
        this.stopTimer();
        this.setPaused(true);
        this.status(`正在加载第${next + 1}局…`);
        try {
            const events: ReplayEvent[] = [];
            let afterSequence = 0;
            const cursors = new Set<number>();
            for (;;) {
                if (cursors.has(afterSequence)) throw new Error('回放分页游标重复');
                cursors.add(afterSequence);
                const chunk = await this.api.chunks(target.roomId, target.setId, afterSequence, 100) as ReplayChunk;
                if (Array.isArray(chunk.events)) events.push(...chunk.events);
                if (!chunk.hasMore) break;
                const cursor = Number(chunk.nextSequence ?? -1);
                if (!Number.isSafeInteger(cursor) || cursor <= afterSequence) throw new Error('回放分页数据无效');
                afterSequence = cursor;
            }
            const frames = this.decode(events, target.setId);
            if (!frames.length) throw new Error(delta < 0 ? '当前已经是第一局' : '当前已经是最后一局');
            this.target = target;
            this.loadingKey = `${target.roomId}:${target.setId}`;
            this.frames = frames;
            this.frameIndex = 0;
            this.clearTable();
            this.start();
        } catch (failure: unknown) {
            this.target = previousTarget;
            this.frames = previousFrames;
            this.frameIndex = previousIndex;
            this.status(this.message(failure, delta < 0 ? '当前已经是第一局' : '当前已经是最后一局'));
        }
    }

    private playedAt(epochMillis: number | undefined, frameIndex: number): string {
        if (!Number.isFinite(epochMillis) || Number(epochMillis) <= 0) {
            return `回放+${(Math.max(0, frameIndex - 1) * 1.2).toFixed(1)}秒`;
        }
        return new Date(Number(epochMillis)).toLocaleTimeString('zh-CN', { hour12: false });
    }

    private status(value: string, color = Color.WHITE): void {
        const label = this.form?.node.getChildByName('runtime-authoritative-replay-status')?.getComponent(Label);
        if (label) { label.string = value; label.color = color; }
    }

    private showMessage(message: string): void { void this.forms.show('UIMessage_Drift', null, null, message); }
    private bind(path: string, action: () => void): void { const node = this.node(path); if (!node) return;
        node.on(Button.EventType.CLICK, action, this); this.bindings.push({ node, action }); }
    private node(path: string): Node | null { return this.form?.find(path) ?? null; }
    private active(path: string, value: boolean): void { const node = this.node(path); if (node) node.active = value; }
    private text(path: string, value: string): void { const label = this.node(path)?.getComponent(Label); if (label) label.string = value; }
    private message(failure: unknown, fallback: string): string { return failure instanceof Error && failure.message.trim() ? failure.message : fallback; }
}
