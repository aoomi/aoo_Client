import { assetManager, instantiate, Label, Node, Sprite, SpriteFrame, tween, Tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { createSeatEntries, type PdkPlayerCount } from './SeatPresenter';

const ROOT_PATH = 'RoomCommon/FloatingPoints';
const RISE_DISTANCE = 15;
const RISE_SECONDS = 0.3;
const EFFECT_SECONDS = 0.65;
const SETTLEMENT_HOLD_SECONDS = 0.3;
const GOLD_FLIGHT_SECONDS = 0.8;
const GOLD_ARRIVAL_HOLD_SECONDS = 0.2;
const GOLD_FADE_SECONDS = 0.3;
const GOLD_HEAD_SCATTER_SIZE = 80;
const GOLD_WIDTH = 54;
const GOLD_HEIGHT = 49;
const GOLD_MAX_GAP = 1;
const GOLD_BUNDLE = 'games-common';
const GOLD_ASSET = 'Atlas/GameCommon/GoldIcon';
const MAX_GOLD_COUNT = 10;

/** Presents one authoritative round delta beside every occupied physical seat. */
export class PdkFloatingPointsPresenter {
    private lastSettlementKey = '';
    private pendingSettlementKey = '';
    private goldFrameRequest: Promise<SpriteFrame> | null = null;
    private generation = 0;

    public constructor(private readonly root: Node) {
        this.hide();
        // GoldIcon is shared by every round. Start loading at room mount instead
        // of making the first settlement compete with authority phase changes.
        void this.loadGoldFrame().catch((error: unknown) => {
            console.warn('[CommonRoomFloatingPoints]', {
                stage: 'GOLD_PRELOAD_FAILED', error: String(error),
            });
        });
    }

    public async present(
        payload: Record<string, unknown>,
        playerCount: PdkPlayerCount,
        localSeat: number,
    ): Promise<void> {
        const roomId = this.requiredInteger(payload.roomId, 'roomId', 1);
        const roundNo = this.requiredInteger(payload.roundNo, 'roundNo', 0);
        const stateVersion = this.requiredInteger(payload.stateVersion, 'stateVersion', 0);
        const shuffleSequence = this.requiredInteger(payload.shuffleSequence, 'shuffleSequence', 0);
        const operationId = String(payload.operationId ?? '');
        const key = `${roomId}:${roundNo}:${shuffleSequence}`;
        if (key === this.lastSettlementKey || key === this.pendingSettlementKey) return;
        this.hide();
        this.pendingSettlementKey = key;
        const generation = this.generation;
        if (payload.staticRestore === true) {
            this.pendingSettlementKey = '';
            this.lastSettlementKey = key;
            console.info('[CommonRoomFloatingPoints]', {
                stage: 'SKIP_STATIC_RESTORE', roomId, roundNo, stateVersion, operationId,
            });
            return;
        }
        const points = this.authoritativePoints(payload.pointList, playerCount);
        const winnerSeat = this.winnerSeat(points);
        const baseScore = this.requiredInteger(payload.baseScore, 'baseScore', 1);
        let goldFrame: SpriteFrame | null = null;
        try {
            goldFrame = winnerSeat >= 0 && points.some((point) => point < 0)
                ? await this.loadGoldFrame()
                : null;
        } catch (error: unknown) {
            if (this.pendingSettlementKey === key) this.pendingSettlementKey = '';
            throw error;
        }
        if (generation !== this.generation || !this.root.isValid) {
            if (this.pendingSettlementKey === key) this.pendingSettlementKey = '';
            console.info('[CommonRoomFloatingPoints]', {
                stage: 'CANCELLED_BEFORE_RENDER', roomId, roundNo, stateVersion, operationId,
            });
            return;
        }
        this.pendingSettlementKey = '';
        this.lastSettlementKey = key;
        const resultEffect = this.require(`${ROOT_PATH}/ResultEffect`);
        const winTemplate = this.require(`${ROOT_PATH}/WinLabel`);
        const loseTemplate = this.require(`${ROOT_PATH}/LoseLabel`);
        const resultTransform = resultEffect.getComponent(UITransform);
        if (!resultTransform) throw new Error('跑得快 ResultEffect 缺少 UITransform');
        resultEffect.active = false;
        const entries = createSeatEntries(playerCount, localSeat);
        const winnerEntry = entries.find((entry) => entry.dataSeat === winnerSeat);
        const winnerHead = winnerEntry ? this.require(`Players/Play_${winnerEntry.physicalSlot}/Head`) : null;
        const goldCounts = points.map((point) => point < 0 ? this.goldCount(point, baseScore) : 0);
        const scoreMounts: Array<{ mount: Node; start: Vec3 }> = [];
        for (const entry of entries) {
            const head = this.require(`Players/Play_${entry.physicalSlot}/Head`);
            const point = points[entry.dataSeat];
            // A zero delta has no win/loss meaning and owns no visual effect.
            if (point === 0) continue;
            const mount = this.createScoreMount(resultEffect, entry.physicalSlot);
            const label = instantiate(point < 0 ? loseTemplate : winTemplate);
            label.name = 'FloatingPointValue';
            label.active = true;
            const component = label.getComponent(Label);
            if (!component) throw new Error(`${point < 0 ? 'LoseLabel' : 'WinLabel'} 缺少 Label 组件`);
            component.string = point < 0 ? String(point) : `+${point}`;
            mount.addChild(label);
            label.setPosition(Vec3.ZERO);
            const headLocal = resultTransform.convertToNodeSpaceAR(head.worldPosition);
            const horizontal = entry.physicalSlot === 0 || entry.physicalSlot === 3 ? 100 : -100;
            const start = new Vec3(headLocal.x + horizontal, headLocal.y, 0);
            mount.setPosition(start);
            mount.active = false;
            scoreMounts.push({ mount, start });
            if (point < 0 && goldFrame && winnerHead) {
                this.flyGold(
                    resultEffect,
                    resultTransform,
                    head,
                    winnerHead,
                    goldCounts[entry.dataSeat],
                    goldFrame,
                    generation,
                    () => this.showScoreMounts(resultEffect, scoreMounts, generation),
                );
            }
        }
        // A settlement without a gold transfer still observes the post-play hold,
        // then reveals its authoritative score instead of leaving the labels hidden.
        if (!goldFrame || !winnerHead || !points.some((point) => point < 0)) {
            tween(resultEffect)
                .delay(SETTLEMENT_HOLD_SECONDS)
                .call(() => this.showScoreMounts(resultEffect, scoreMounts, generation))
                .start();
        }
        console.info('[CommonRoomFloatingPoints]', {
            stage: 'PLAY', roomId, roundNo, stateVersion, operationId, pointList: points,
            baseScore, winnerSeat, goldCounts,
        });
    }

    /** Stops the current round's visual without reopening an already consumed settlement. */
    public hide(): void {
        this.generation += 1;
        this.pendingSettlementKey = '';
        const resultEffect = this.find(`${ROOT_PATH}/ResultEffect`);
        if (!resultEffect) return;
        Tween.stopAllByTarget(resultEffect);
        for (const mount of [...resultEffect.children]) {
            Tween.stopAllByTarget(mount);
            const opacity = mount.getComponent(UIOpacity);
            if (opacity) Tween.stopAllByTarget(opacity);
            if (mount.name.startsWith('RuntimeGoldCoin') || mount.name.startsWith('RuntimeScoreEffect')) {
                mount.removeFromParent();
                mount.destroy();
                continue;
            }
            this.removeRuntimeLabel(mount);
            mount.active = false;
        }
        resultEffect.active = false;
        this.find(`${ROOT_PATH}/WinLabel`)!.active = false;
        this.find(`${ROOT_PATH}/LoseLabel`)!.active = false;
    }

    public destroy(): void {
        this.hide();
        this.lastSettlementKey = '';
        this.pendingSettlementKey = '';
        this.goldFrameRequest = null;
    }

    private flyGold(
        resultEffect: Node,
        transform: UITransform,
        loserHead: Node,
        winnerHead: Node,
        count: number,
        frame: SpriteFrame,
        generation: number,
        onFirstArrival: () => void,
    ): void {
        const start = transform.convertToNodeSpaceAR(loserHead.worldPosition);
        const target = transform.convertToNodeSpaceAR(winnerHead.worldPosition);
        const scatterOffsets = this.dispersedHeadOffsets(count);
        for (let index = 0; index < count; index += 1) {
            const coin = new Node(`RuntimeGoldCoin_${index}`);
            coin.layer = resultEffect.layer;
            coin.addComponent(UITransform).setContentSize(GOLD_WIDTH, GOLD_HEIGHT);
            coin.addComponent(Sprite).spriteFrame = frame;
            const opacity = coin.addComponent(UIOpacity);
            resultEffect.addChild(coin);
            const startScatter = scatterOffsets[index];
            coin.setPosition(start.x + startScatter.x, start.y + startScatter.y, 1);
            coin.active = true;
            const middle = new Vec3(
                (start.x + target.x) / 2 + startScatter.x,
                (start.y + target.y) / 2 + startScatter.y,
                1,
            );
            const arrival = new Vec3(target.x + startScatter.x, target.y + startScatter.y, 1);
            tween(coin)
                .delay(SETTLEMENT_HOLD_SECONDS)
                // Keep the scattered formation unchanged. The first half visibly
                // accelerates and the second half eases into the winner's head.
                .to(GOLD_FLIGHT_SECONDS / 2, {
                    position: middle,
                    scale: new Vec3(0.88, 0.88, 1),
                }, { easing: 'quadIn' })
                .to(GOLD_FLIGHT_SECONDS / 2, {
                    position: arrival,
                    scale: new Vec3(0.75, 0.75, 1),
                }, { easing: 'quadOut' })
                .call(() => {
                    if (!coin.isValid) return;
                    if (index === 0) onFirstArrival();
                    tween(opacity)
                        .delay(GOLD_ARRIVAL_HOLD_SECONDS)
                        .to(GOLD_FADE_SECONDS, { opacity: 0 }, { easing: 'quadOut' })
                        .call(() => {
                            if (!coin.isValid) return;
                            coin.removeFromParent();
                            coin.destroy();
                            this.hideResultEffectWhenIdle(resultEffect, generation);
                        })
                        .start();
                })
                .start();
        }
        resultEffect.active = true;
    }

    /**
     * Distributes up to ten coins inside a compact area no wider than the
     * authored coin size plus one pixel. Each position is independently random,
     * so natural overlap is allowed without letting the pile spread too far.
     */
    private dispersedHeadOffsets(count: number): Vec3[] {
        const halfX = Math.min(GOLD_HEAD_SCATTER_SIZE / 2, (GOLD_WIDTH + GOLD_MAX_GAP) / 2);
        const halfY = Math.min(GOLD_HEAD_SCATTER_SIZE / 2, (GOLD_HEIGHT + GOLD_MAX_GAP) / 2);
        const total = Math.min(MAX_GOLD_COUNT, Math.max(0, count));
        const offsets: Vec3[] = [];
        for (let index = 0; index < total; index += 1) {
            let candidate = new Vec3();
            for (let attempt = 0; attempt < 12; attempt += 1) {
                candidate = new Vec3(
                    Math.random() * halfX * 2 - halfX,
                    Math.random() * halfY * 2 - halfY,
                    0,
                );
                // Overlap is intentional, but near-identical centers make two
                // physical nodes look like one and falsely suggest a bad count.
                if (offsets.every((offset) => Vec3.distance(offset, candidate) >= 4)) break;
            }
            offsets.push(candidate);
        }
        return offsets;
    }

    private showScoreMounts(
        resultEffect: Node,
        entries: ReadonlyArray<{ mount: Node; start: Vec3 }>,
        generation: number,
    ): void {
        if (generation !== this.generation || !resultEffect.isValid) return;
        for (const { mount, start } of entries) {
            if (!mount.isValid || mount.active) continue;
            mount.active = true;
            tween(mount)
                .to(RISE_SECONDS, { position: new Vec3(start.x, start.y + RISE_DISTANCE, start.z) }, { easing: 'linear' })
                .delay(Math.max(0, EFFECT_SECONDS - RISE_SECONDS))
                .call(() => {
                    if (!mount.isValid) return;
                    mount.removeFromParent();
                    mount.destroy();
                    this.hideResultEffectWhenIdle(resultEffect, generation);
                })
                .start();
        }
        resultEffect.active = true;
    }

    private goldCount(point: number, baseScore: number): number {
        const baseMultiples = Math.floor(Math.abs(point) / baseScore);
        return Math.min(MAX_GOLD_COUNT, Math.max(1, baseMultiples));
    }

    private createScoreMount(resultEffect: Node, physicalSlot: number): Node {
        const mount = new Node(`RuntimeScoreEffect_${physicalSlot}`);
        mount.layer = resultEffect.layer;
        mount.addComponent(UITransform).setContentSize(1, 1);
        resultEffect.addChild(mount);
        return mount;
    }

    private hideResultEffectWhenIdle(resultEffect: Node, generation: number): void {
        if (generation !== this.generation || !resultEffect.isValid) return;
        const hasRuntimeVisual = resultEffect.children.some((child) => (
            child.name.startsWith('RuntimeGoldCoin') || child.name.startsWith('RuntimeScoreEffect')
        ));
        if (!hasRuntimeVisual) resultEffect.active = false;
    }

    private winnerSeat(points: readonly number[]): number {
        let winner = -1;
        for (let seat = 0; seat < points.length; seat += 1) {
            if (points[seat] > 0 && (winner < 0 || points[seat] > points[winner])) winner = seat;
        }
        return winner;
    }

    private loadGoldFrame(): Promise<SpriteFrame> {
        if (this.goldFrameRequest) return this.goldFrameRequest;
        this.goldFrameRequest = new Promise<SpriteFrame>((resolve, reject) => {
            const load = (bundle: NonNullable<ReturnType<typeof assetManager.getBundle>>): void => {
                bundle.load(GOLD_ASSET, SpriteFrame, (error, frame) => {
                    if (error || !frame) reject(error ?? new Error(`公共金豆图片缺失：${GOLD_ASSET}`));
                    else resolve(frame);
                });
            };
            const loaded = assetManager.getBundle(GOLD_BUNDLE);
            if (loaded) load(loaded);
            else assetManager.loadBundle(GOLD_BUNDLE, (error, bundle) => {
                if (error || !bundle) reject(error ?? new Error(`公共资源 Bundle ${GOLD_BUNDLE} 不存在`));
                else load(bundle);
            });
        }).catch((error: unknown) => {
            this.goldFrameRequest = null;
            throw error;
        });
        return this.goldFrameRequest;
    }

    private authoritativePoints(value: unknown, playerCount: number): number[] {
        if (!Array.isArray(value) || value.length < playerCount) {
            throw new Error(`跑得快权威本局分数无效: ${JSON.stringify(value)}`);
        }
        return value.slice(0, playerCount).map((point, dataSeat) => {
            const number = Number(point);
            if (!Number.isFinite(number)) throw new Error(`跑得快权威本局分数无效: seat=${dataSeat}, value=${String(point)}`);
            return number;
        });
    }

    private requiredInteger(value: unknown, field: string, minimum: number): number {
        const number = Number(value);
        if (!Number.isSafeInteger(number) || number < minimum) {
            throw new Error(`跑得快权威结算${field}无效: ${String(value)}`);
        }
        return number;
    }

    private removeRuntimeLabel(mount: Node): void {
        const existing = mount.getChildByName('FloatingPointValue');
        if (!existing) return;
        existing.removeFromParent();
        existing.destroy();
    }

    private find(path: string): Node | null {
        let current: Node | null = this.root;
        for (const segment of path.split('/')) current = current?.getChildByName(segment) ?? null;
        return current;
    }

    private require(path: string): Node {
        const node = this.find(path);
        if (!node) throw new Error(`PDK_CommonRoom 节点契约缺失: ${path}`);
        return node;
    }
}
