import { _decorator, assetManager, Animation, AssetManager, Color, Component, Label, Node, Sprite, SpriteFrame, sp, UITransform, view } from 'cc';
import { PlayerAvatarService } from './PlayerAvatarService';

const { ccclass } = _decorator;

type HeadDirection = 'left' | 'right';
export type CommonHeadVariant = 'Game' | 'List' | 'Stat';
let emojiSkeletonPromise: Promise<sp.SkeletonData> | null = null;

@ccclass('CommonHeadController')
export class CommonHeadController extends Component {
    private avatar: Node | null = null;
    private ready: Node | null = null;
    private chatLeft: Node | null = null;
    private chatRight: Node | null = null;
    private chatLeftBottom: Node | null = null;
    private chatRightBottom: Node | null = null;
    private voiceLeft: Node | null = null;
    private voiceRight: Node | null = null;
    private faceAnimation: Node | null = null;
    private emojiGeneration = 0;
    private avatarGeneration = 0;
    private readonly authoredAvatarFrames = new Map<Sprite, SpriteFrame | null>();
    private readyOffsetX = 0;
    private voiceTimer: number | undefined;

    protected onLoad(): void {
        this.cacheNodes();
        this.hideTransientEffects();
    }

    public useVariant(variant: CommonHeadVariant): Node {
        let selected: Node | null = null;
        for (const name of ['Game', 'List', 'Stat'] as const) {
            const node = this.node.getChildByName(name);
            if (!node) throw new Error(`CommonHead 缺少类型节点: ${name}`);
            node.active = name === variant;
            if (node.active) selected = node;
        }
        if (!selected) throw new Error(`CommonHead 类型无效: ${variant}`);
        return selected;
    }

    public showQuickText(value: string): void {
        this.cacheNodes();
        this.setLabel(this.chatLeft, value);
        this.setLabel(this.chatRight, value);
        this.activateDirectedPair(this.chatLeft, this.chatRight);
    }

    public hideQuickText(): void {
        this.setPairActive(this.chatLeft, this.chatRight, false, false);
        this.setPairActive(this.chatLeftBottom, this.chatRightBottom, false, false);
    }

    public showVoice(): void {
        this.cacheNodes();
        this.activateDirectedPair(this.voiceLeft, this.voiceRight);
        this.startVoiceAnimation();
    }

    public hideVoice(): void {
        if (this.voiceTimer !== undefined) globalThis.clearInterval(this.voiceTimer);
        this.voiceTimer = undefined;
        this.setPairActive(this.voiceLeft, this.voiceRight, false, false);
    }

    protected onDestroy(): void {
        if (this.voiceTimer !== undefined) globalThis.clearInterval(this.voiceTimer);
    }

    public async showEmoji(emojiId: number): Promise<void> {
        this.cacheNodes();
        const generation = ++this.emojiGeneration;
        const skeletonData = await CommonHeadController.emojiSkeleton();
        if (generation !== this.emojiGeneration || !this.faceAnimation?.isValid) return;
        const sprite = this.faceAnimation.getComponent(Sprite);
        const animation = this.faceAnimation.getComponent(Animation);
        if (sprite) sprite.enabled = false;
        if (animation) {
            animation.stop();
            animation.enabled = false;
        }
        const skeleton = this.faceAnimation.getComponent(sp.Skeleton) ?? this.faceAnimation.addComponent(sp.Skeleton);
        skeleton.enabled = true;
        skeleton.skeletonData = skeletonData;
        this.faceAnimation.active = true;
        skeleton.setAnimation(0, `emoji_${emojiId}`, false);
    }

    public hideEmoji(): void {
        this.emojiGeneration += 1;
        const skeleton = this.faceAnimation?.getComponent(sp.Skeleton);
        skeleton?.clearTracks();
        if (skeleton) skeleton.enabled = false;
        if (this.faceAnimation) this.faceAnimation.active = false;
    }

    public showReady(visible: boolean): void {
        this.cacheNodes();
        if (!this.ready) return;
        if (visible) this.applyReadyDirection(this.direction());
        this.ready.active = visible;
    }

    public hideTransientEffects(): void {
        this.hideQuickText();
        this.hideVoice();
        this.hideEmoji();
    }

    public async showPlayerAvatar(playerId: number, headImageUrl = ''): Promise<void> {
        this.cacheNodes();
        this.captureAuthoredAvatars();
        const generation = ++this.avatarGeneration;
        const frame = await PlayerAvatarService.frame(playerId, headImageUrl).catch(() => null);
        if (!frame || generation !== this.avatarGeneration || !this.node.isValid) return;
        for (const sprite of this.avatarSprites()) sprite.spriteFrame = frame;
    }

    /**
     * 游戏位置始终保留 CommonHead/Game；无人时只隐藏玩家数据，不能隐藏公共头像节点。
     * 这样所有接入公共头像的玩法都使用同一套空座表现。
     */
    public showGamePlayer(occupied: boolean): void {
        const game = this.useVariant('Game');
        const playerInfo = this.required('Game/Head/PlayerInfo');
        playerInfo.active = occupied;
        if (!occupied) {
            this.avatarGeneration += 1;
            this.captureAuthoredAvatars();
            for (const [sprite, frame] of this.authoredAvatarFrames) {
                if (sprite.isValid) sprite.spriteFrame = frame;
            }
            for (const name of ['Lb_PlayerName', 'Lb_PlayerScore']) {
                const label = playerInfo.getChildByName(name)?.getComponent(Label);
                if (label) label.string = '';
            }
            this.showReady(false);
            this.hideTransientEffects();
        }
        game.active = true;
    }

    private captureAuthoredAvatars(): void {
        if (this.authoredAvatarFrames.size > 0) return;
        for (const sprite of this.avatarSprites()) this.authoredAvatarFrames.set(sprite, sprite.spriteFrame);
    }

    private cacheNodes(): void {
        if (this.avatar?.isValid) return;
        this.avatar = this.required('Game/Head');
        this.ready = this.required('Game/GameStatus/Img_Ready');
        this.chatLeft = this.required('Game/ChatEffects/ChatBubbleLeft');
        this.chatRight = this.required('Game/ChatEffects/ChatBubbleRight');
        this.chatLeftBottom = this.required('Game/ChatEffects/ChatBubbleLeftBottom');
        this.chatRightBottom = this.required('Game/ChatEffects/ChatBubbleRightBottom');
        this.voiceLeft = this.required('Game/ChatEffects/VoiceLeft');
        this.voiceRight = this.required('Game/ChatEffects/VoiceRight');
        this.faceAnimation = this.required('Game/ChatEffects/FaceAnimation');
        this.readyOffsetX = Math.abs(this.ready.position.x);
    }

    private activateDirectedPair(left: Node | null, right: Node | null): void {
        const direction = this.direction();
        this.setPairActive(left, right, direction === 'left', direction === 'right');
    }

    private avatarSprites(): Sprite[] {
        const result: Sprite[] = [];
        const variants = [
            this.node.getChildByName('Game')?.getChildByName('Head'),
            this.node.getChildByName('List'),
            this.node.getChildByName('Stat'),
        ];
        for (const variant of variants) {
            if (!variant) continue;
            for (const shape of ['SquareAvatar', 'RoundAvatar']) {
                const sprite = variant.getChildByName(shape)?.getChildByName('Mask')
                    ?.getChildByName('Img_Avatar')?.getComponent(Sprite);
                if (sprite) result.push(sprite);
            }
        }
        if (result.length === 0) throw new Error('CommonHead 缺少头像 Sprite');
        return result;
    }

    /** 左半屏头像使用 Right 节点向右展开，右半屏头像使用 Left 节点向左展开。 */
    private direction(): HeadDirection {
        if (!this.avatar) throw new Error('CommonHead 头像节点未初始化');
        const visible = view.getVisibleSize();
        const origin = view.getVisibleOrigin();
        const visibleCenterX = origin.x + visible.width * 0.5;
        return this.avatar.worldPosition.x < visibleCenterX ? 'right' : 'left';
    }

    private applyReadyDirection(direction: HeadDirection): void {
        if (!this.ready) return;
        const position = this.ready.position;
        this.ready.setPosition(direction === 'right' ? this.readyOffsetX : -this.readyOffsetX, position.y, position.z);
    }

    private setPairActive(left: Node | null, right: Node | null, leftActive: boolean, rightActive: boolean): void {
        if (left) left.active = leftActive;
        if (right) right.active = rightActive;
    }

    /** The prefab contains separate wave sprites, so animate them without relying on missing clips. */
    private startVoiceAnimation(): void {
        if (this.voiceTimer !== undefined) globalThis.clearInterval(this.voiceTimer);
        let phase = 0;
        const render = (): void => {
            for (const root of [this.voiceLeft, this.voiceRight]) {
                if (!root?.active) continue;
                root.children.forEach(child => {
                    const match = /^Img_VoiceLevel([123])$/.exec(child.name);
                    if (match) child.active = Number(match[1]) <= phase + 1;
                    else child.active = true;
                });
            }
            phase = (phase + 1) % 3;
        };
        render();
        this.voiceTimer = globalThis.setInterval(render, 220);
    }

    private setLabel(root: Node | null, value: string): void {
        if (!root) return;
        let label = root.getComponentInChildren(Label);
        if (!label) {
            const text = new Node('Text');
            text.layer = root.layer;
            text.addComponent(UITransform).setContentSize(240, 70);
            label = text.addComponent(Label);
            label.fontSize = 22;
            label.lineHeight = 26;
            label.color = new Color(66, 66, 66, 255);
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
            label.overflow = Label.Overflow.SHRINK;
            root.addChild(text);
        }
        label.string = value;
    }

    private required(path: string): Node {
        let current: Node | null = this.node;
        for (const segment of path.split('/')) current = current?.getChildByName(segment) ?? null;
        if (!current) throw new Error(`CommonHead 节点缺失: ${path}`);
        return current;
    }

    private static emojiSkeleton(): Promise<sp.SkeletonData> {
        if (emojiSkeletonPromise) return emojiSkeletonPromise;
        const request = new Promise<sp.SkeletonData>((resolve, reject) => {
            const load = (bundle: AssetManager.Bundle): void => {
                bundle.load('Spine/Emoji/emoji_super', sp.SkeletonData, (error, skeletonData) => {
                    if (error || !skeletonData) reject(error ?? new Error('表情 Spine 资源加载失败'));
                    else resolve(skeletonData);
                });
            };
            const cached = assetManager.getBundle('games-common');
            if (cached) load(cached);
            else assetManager.loadBundle('games-common', (error, bundle) => error ? reject(error) : load(bundle));
        }).catch((error: unknown) => {
            emojiSkeletonPromise = null;
            throw error;
        });
        emojiSkeletonPromise = request;
        return request;
    }
}
