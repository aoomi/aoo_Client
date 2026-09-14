import { assetManager, Button, Color, instantiate, isValid, Label, Node, Prefab, UITransform } from 'cc';
import type { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { CardPresenter } from '../../../Games/Poker/PDK/Common/Code/Runtime/Room/CardPresenter';
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
}

interface ReplaySnapshot {
    readonly family?: string;
    readonly roomId?: number | string;
    readonly roundNo?: number;
    readonly roundLimit?: number;
    readonly phase?: string;
    readonly currentSeat?: number;
    readonly currentTrick?: { readonly seat?: number; readonly cards?: readonly number[] };
    readonly seats?: Readonly<Record<string, ReplaySeat>>;
}

interface ReplayFrame {
    readonly sequence: number;
    readonly messageId: string;
    readonly playVersion: string;
    readonly snapshot: ReplaySnapshot;
}

/** Plays ordered hall replay chunks inside the same PDK_CommonRoom used by live play. */
export class PdkReplayController {
    private form: LegacyForm | null = null;
    private readonly cards = new CardPresenter();
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
        for (const binding of this.bindings.splice(0)) {
            if (isValid(binding.node, true)) binding.node.off(Button.EventType.CLICK, binding.action, this);
        }
        this.form = null;
    }

    private onCreate(form: LegacyForm): void {
        this.form = form;
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
            this.frames = this.decode(events);
            if (!this.frames.length) throw new Error('该战绩暂无可播放的权威状态');
            this.status(`房间 ${target.roomId} · 共 ${this.frames.length} 帧`);
            this.start();
        } catch (failure: unknown) {
            if (generation !== this.renderGeneration) return;
            this.status(this.message(failure, '回放加载失败，请稍后重试'), new Color(255, 205, 205, 255));
            this.reportError(failure);
        }
    }

    private decode(events: readonly ReplayEvent[]): ReplayFrame[] {
        const frames: ReplayFrame[] = [];
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
            frames.push({ sequence, messageId, playVersion: String(event.playVersion ?? ''), snapshot });
        }
        return frames;
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
        this.timer = globalThis.setInterval(() => { if (!this.paused) void this.step(1); }, 1200);
        this.setPaused(false);
        void this.step(1);
    }

    private stop(): void {
        this.renderGeneration += 1;
        this.stopTimer();
        this.setPaused(true);
    }

    private stopTimer(): void {
        if (this.timer) globalThis.clearInterval(this.timer);
        this.timer = 0;
    }

    private setPaused(value: boolean): void {
        this.paused = value;
        this.active('control/btn_play', value);
        this.active('control/btn_pause', !value);
        this.form?.node.emit('authoritative-replay-state', {
            roomId: this.target?.roomId, setId: this.target?.setId,
            frameIndex: this.frameIndex, frameCount: this.frames.length, paused: value,
        });
    }

    private async step(delta: number): Promise<void> {
        if (!this.frames.length) return;
        if (delta < 0) this.frameIndex = Math.max(0, this.frameIndex - 2);
        const frame = this.frames[this.frameIndex];
        if (!frame) { this.setPaused(true); return; }
        await this.render(frame);
        this.frameIndex += 1;
        this.status(`房间 ${this.target?.roomId ?? '-'} · ${this.frameIndex}/${this.frames.length} · 序号 ${frame.sequence}`);
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
        this.text('Panel/Bg_Wanfa/Labei_Wanfa', '跑得快 · 权威回放');
        this.text('BG/Room_Info/Room_Num', `${seatEntries.length}人场  局数:${snapshot.roundNo ?? 0}/${snapshot.roundLimit ?? '-'}`);
        this.text('BG/Room_Info/Room_Id', `房间号:${snapshot.roomId ?? this.target?.roomId ?? ''}`);
        for (let ui = 0; ui < 4; ui += 1) {
            this.active(`Players/Sp_Seat_${ui}/Head`, false);
            this.node(`Players/Sp_Seat_${ui}/Card/Out_Card`)?.removeAllChildren();
        }
        this.node('Players/Sp_Seat_0/Card/Hand_Cards')?.removeAllChildren();
        for (const [key, seat] of seatEntries) {
            const ui = (Number(key) + seatEntries.length - clientSeat) % Math.max(1, seatEntries.length);
            this.active(`Players/Sp_Seat_${ui}/Head`, true);
            this.text(`Players/Sp_Seat_${ui}/Head/Player_Name`, String(seat.name ?? `玩家${seat.playerId ?? ''}`));
            const hand = this.cardsOf(seat.cards, seat.remainingCards);
            if (ui === 0 && hand.length) await this.renderCards('Players/Sp_Seat_0/Card/Hand_Cards', hand);
            if (ui !== 0) {
                const count = Number(seat.cardCount ?? hand.length);
                this.text(`Players/Sp_Seat_${ui}/Head/Card_Num`, `${count}张`);
            }
        }
        const trickCards = this.cardsOf(snapshot.currentTrick?.cards);
        if (trickCards.length) {
            const ui = (Number(snapshot.currentTrick?.seat ?? 0) + seatEntries.length - clientSeat) % Math.max(1, seatEntries.length);
            await this.renderCards(`Players/Sp_Seat_${ui}/Card/Out_Card`, trickCards);
        }
    }

    private cardsOf(...values: ReadonlyArray<readonly number[] | undefined>): number[] {
        for (const value of values) if (Array.isArray(value)) return value.filter(card => Number.isInteger(card) && card > 0);
        return [];
    }

    private async renderCards(path: string, cards: readonly number[]): Promise<void> {
        const parent = this.node(path); if (!parent) return;
        parent.removeAllChildren(); parent.active = cards.length > 0;
        for (const card of cards) await this.cards.create(parent, card);
    }

    private clearTable(): void {
        this.node('Players/Sp_Seat_0/Card/Hand_Cards')?.removeAllChildren();
        for (let index = 0; index < 4; index += 1) {
            this.node(`Players/Sp_Seat_${index}/Card/Out_Card`)?.removeAllChildren();
        }
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
        this.bind('control/btn_last', () => this.showMessage('当前回放仅包含所选局'));
        this.bind('control/btn_next', () => this.showMessage('当前回放仅包含所选局'));
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
