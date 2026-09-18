import { Node, Tween, tween, UIOpacity, Vec3 } from 'cc';

export interface PokerDealNodeAnimOptions {
    /** 每批同时发出的牌数。 */
    batchSize: number;
    /** 相邻两批的起始间隔，单位为秒。 */
    batchInterval: number;
    /** 单张牌从牌堆移动到手牌位置的时长，单位为秒。 */
    moveDuration: number;
    /** 牌从牌堆出现时的缩放。 */
    startScale: number;
    /** 是否从牌堆位置飞向目标；关闭时在最终牌位依次展开。 */
    travelFromOrigin: boolean;
    /** 原位发牌时的初始透明度，避免整张牌突然闪现。 */
    startOpacity: number;
    /** 原位发牌时相对最终牌位向下偏移的像素。 */
    revealOffsetY: number;
    /** 每批开始时触发，可用于播放一次发牌音效。 */
    onBatchStart?: () => void;
}

const DEFAULT_OPTIONS: Readonly<PokerDealNodeAnimOptions> = {
    batchSize: 1,
    batchInterval: 0.08,
    moveDuration: 0.18,
    startScale: 0.6,
    travelFromOrigin: true,
    startOpacity: 96,
    revealOffsetY: 6,
};

/**
 * 扑克公共节点发牌动画。
 *
 * 由 Creator 2.2.2 版本的 PDK `Deal()` 提炼而来，仅依赖 Cocos 节点 Tween，
 * 不依赖 Spine。16 张、8 张、3 张等手牌数量共用这一套参数化实现。
 */
export class PokerDealNodeAnim {
    public static async play(
        cards: readonly Node[],
        origins: readonly Node[],
        options: Partial<PokerDealNodeAnimOptions> = {},
    ): Promise<void> {
        if (cards.length === 0) return;
        if (origins.length === 0) throw new Error('PokerDealNodeAnim requires at least one origin node');

        const config = this.normalizeOptions(options);
        const plans = cards.flatMap((card, index) => {
            const origin = origins[Math.min(index % config.batchSize, origins.length - 1)];
            if (!card.isValid || !origin?.isValid) return [];
            const plan = {
                card,
                targetPosition: card.worldPosition.clone(),
                targetScale: card.scale.clone(),
                opacity: card.getComponent(UIOpacity) ?? card.addComponent(UIOpacity),
                targetOpacity: card.getComponent(UIOpacity)?.opacity ?? 255,
            };
            Tween.stopAllByTarget(card);
            Tween.stopAllByTarget(plan.opacity);
            if (config.travelFromOrigin) {
                card.setWorldPosition(origin.worldPosition);
                card.setScale(config.startScale, config.startScale, config.startScale);
            } else {
                card.setWorldPosition(new Vec3(
                    plan.targetPosition.x,
                    plan.targetPosition.y - config.revealOffsetY,
                    plan.targetPosition.z,
                ));
                card.setScale(plan.targetScale);
                // Pending cards must remain fully hidden. Applying startOpacity
                // here would expose the whole hand before its individual turn.
                plan.opacity.opacity = 0;
            }
            return [plan];
        });
        const batches: Promise<void>[] = [];
        for (let offset = 0; offset < plans.length; offset += config.batchSize) {
            const batchIndex = offset / config.batchSize;
            const batch = plans.slice(offset, offset + config.batchSize);
            batches.push(this.playBatch(batch, batchIndex * config.batchInterval, config));
        }
        await Promise.all(batches);
    }

    private static async playBatch(
        cards: ReadonlyArray<DealCardPlan>,
        delay: number,
        options: Readonly<PokerDealNodeAnimOptions>,
    ): Promise<void> {
        await this.delay(delay);
        options.onBatchStart?.();
        await Promise.all(cards.map((card) => this.moveCard(card, options)));
    }

    private static moveCard(
        plan: DealCardPlan,
        options: Readonly<PokerDealNodeAnimOptions>,
    ): Promise<void> {
        const { card, targetPosition, targetScale, opacity, targetOpacity } = plan;
        if (!card.isValid) return Promise.resolve();

        return new Promise((resolve) => {
            if (!options.travelFromOrigin) opacity.opacity = options.startOpacity;
            tween(opacity)
                .to(options.moveDuration, { opacity: targetOpacity })
                .start();
            tween(card)
                .to(options.moveDuration, {
                    worldPosition: targetPosition,
                    scale: targetScale,
                })
                .call(() => resolve())
                .start();
        });
    }

    private static normalizeOptions(
        options: Partial<PokerDealNodeAnimOptions>,
    ): Readonly<PokerDealNodeAnimOptions> {
        const config = { ...DEFAULT_OPTIONS, ...options };
        if (!Number.isInteger(config.batchSize) || config.batchSize < 1) {
            throw new Error('PokerDealNodeAnim batchSize must be a positive integer');
        }
        for (const [name, value] of [
            ['batchInterval', config.batchInterval],
            ['moveDuration', config.moveDuration],
            ['startScale', config.startScale],
            ['revealOffsetY', config.revealOffsetY],
        ] as const) {
            if (!Number.isFinite(value) || value < 0) {
                throw new Error(`PokerDealNodeAnim ${name} must be a non-negative number`);
            }
        }
        if (!Number.isFinite(config.startOpacity) || config.startOpacity < 0 || config.startOpacity > 255) {
            throw new Error('PokerDealNodeAnim startOpacity must be between 0 and 255');
        }
        return config;
    }

    private static delay(seconds: number): Promise<void> {
        if (seconds === 0) return Promise.resolve();
        return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    }
}

interface DealCardPlan {
    card: Node;
    targetPosition: Vec3;
    targetScale: Vec3;
    opacity: UIOpacity;
    targetOpacity: number;
}
