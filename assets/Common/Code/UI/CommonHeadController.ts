import { _decorator, assetManager, Animation, AssetManager, Color, Component, Graphics, Label, Mask, Node, Sprite, SpriteFrame, sp, UITransform, view } from 'cc';
import { PlayerAvatarService } from './PlayerAvatarService';

const { ccclass } = _decorator;

type HeadDirection = 'left' | 'right';
export type CommonHeadVariant = 'Game' | 'List' | 'Stat';
export type CommonHeadSkin = 'DEFAULT' | 'XQP_CIRCULAR';
let emojiSkeletonPromise: Promise<sp.SkeletonData> | null = null;

interface NodeLayout {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly width: number;
    readonly height: number;
}

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
    private readonly defaultGameLayouts = new Map<Node, NodeLayout>();
    private skin: CommonHeadSkin = 'DEFAULT';
    private defaultRoundMaskType: Mask.Type | null = null;
    private defaultPlayerInfoSpriteEnabled: boolean | null = null;
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

    /** Optional visual skin; occupancy and avatar data remain owned by CommonHead. */
    public useSkin(skin: CommonHeadSkin): void {
        this.cacheNodes();
        this.captureDefaultGameLayouts();
        this.skin = skin;
        if (skin === 'XQP_CIRCULAR') this.applyXqpCircularSkin();
        else this.restoreDefaultGameSkin();
        this.syncXqpOccupancyVisuals(this.required('Game/Head/PlayerInfo').active);
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
        this.syncXqpOccupancyVisuals(occupied);
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

    private captureDefaultGameLayouts(): void {
        if (this.defaultGameLayouts.size > 0) return;
        const roundMask = this.required('Game/Head/RoundAvatar/Mask').getComponent(Mask);
        this.defaultRoundMaskType = roundMask?.type ?? null;
        const playerInfoSprite = this.required('Game/Head/PlayerInfo').getComponent(Sprite);
        this.defaultPlayerInfoSpriteEnabled = playerInfoSprite?.enabled ?? null;
        for (const node of this.gameSkinNodes()) {
            const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
            this.defaultGameLayouts.set(node, {
                x: node.position.x, y: node.position.y, z: node.position.z,
                width: transform.contentSize.width, height: transform.contentSize.height,
            });
        }
    }

    private applyXqpCircularSkin(): void {
        const head = this.required('Game/Head');
        const square = this.required('Game/Head/SquareAvatar');
        const round = this.required('Game/Head/RoundAvatar');
        const frame = this.required('Game/Head/RoundAvatar/Img_Frame');
        const mask = this.required('Game/Head/RoundAvatar/Mask');
        const avatar = this.required('Game/Head/RoundAvatar/Mask/Img_Avatar');
        const playerInfo = this.required('Game/Head/PlayerInfo');
        const name = this.required('Game/Head/PlayerInfo/Lb_PlayerName');
        const score = this.required('Game/Head/PlayerInfo/Lb_PlayerScore');
        square.active = false;
        round.active = true;
        frame.active = true;
        mask.active = true;
        const roundMask = mask.getComponent(Mask);
        if (!roundMask) throw new Error('CommonHead XQP 圆形皮肤缺少 Mask 组件');
        roundMask.type = Mask.Type.ELLIPSE;
        const playerInfoSprite = playerInfo.getComponent(Sprite);
        if (playerInfoSprite) playerInfoSprite.enabled = false;
        this.layout(head, 0, 0, 90, 90);
        this.layout(round, 0, 0, 90, 90);
        this.layout(frame, 0, 0, 90, 90);
        this.layout(mask, 0, 0, 85, 85);
        this.layout(avatar, 0, 0, 90, 90);
        this.layout(playerInfo, 0, 0, 120, 100);
        this.layout(name, 0, -32.5, 88, 25);
        this.layout(score, 0, -60, 90, 25);
        this.ensureXqpPlate(playerInfo, 'NcBg', 0, -32.969, 120, 24);
        this.ensureXqpPlate(playerInfo, 'CentBg', 0, -60.469, 90, 25);
        this.ensureXqpVacancy(head);
    }

    private restoreDefaultGameSkin(): void {
        this.required('Game/Head/SquareAvatar').active = true;
        this.required('Game/Head/RoundAvatar').active = true;
        this.required('Game/Head/RoundAvatar/Mask').active = false;
        this.required('Game/Head/RoundAvatar/Img_Frame').active = false;
        const roundMask = this.required('Game/Head/RoundAvatar/Mask').getComponent(Mask);
        if (roundMask && this.defaultRoundMaskType !== null) roundMask.type = this.defaultRoundMaskType;
        const playerInfoSprite = this.required('Game/Head/PlayerInfo').getComponent(Sprite);
        if (playerInfoSprite && this.defaultPlayerInfoSpriteEnabled !== null) playerInfoSprite.enabled = this.defaultPlayerInfoSpriteEnabled;
        for (const [node, value] of this.defaultGameLayouts) {
            node.setPosition(value.x, value.y, value.z);
            node.getComponent(UITransform)?.setContentSize(value.width, value.height);
        }
    }

    private gameSkinNodes(): Node[] {
        return [
            this.required('Game/Head'),
            this.required('Game/Head/RoundAvatar'),
            this.required('Game/Head/RoundAvatar/Img_Frame'),
            this.required('Game/Head/RoundAvatar/Mask'),
            this.required('Game/Head/RoundAvatar/Mask/Img_Avatar'),
            this.required('Game/Head/PlayerInfo'),
            this.required('Game/Head/PlayerInfo/Lb_PlayerName'),
            this.required('Game/Head/PlayerInfo/Lb_PlayerScore'),
        ];
    }

    private layout(node: Node, x: number, y: number, width: number, height: number): void {
        node.setPosition(x, y, node.position.z);
        (node.getComponent(UITransform) ?? node.addComponent(UITransform)).setContentSize(width, height);
    }

    private ensureXqpPlate(parent: Node, name: string, x: number, y: number, width: number, height: number): Node {
        let plate = parent.getChildByName(name);
        if (!plate) {
            plate = new Node(name);
            plate.layer = parent.layer;
            parent.addChild(plate);
            plate.setSiblingIndex(0);
            const graphics = plate.addComponent(Graphics);
            graphics.fillColor = new Color(0, 0, 0, 140);
            graphics.roundRect(-width / 2, -height / 2, width, height, 4);
            graphics.fill();
        }
        this.layout(plate, x, y, width, height);
        return plate;
    }

    /** XQP empty positions use an explicit outline instead of rendering an empty avatar mask. */
    private ensureXqpVacancy(parent: Node): Node {
        let empty = parent.getChildByName('XqpVacancy');
        if (empty) return empty;
        empty = new Node('XqpVacancy');
        empty.layer = parent.layer;
        parent.addChild(empty);
        this.layout(empty, 0, 0, 90, 90);
        const outline = empty.addComponent(Graphics);
        outline.lineWidth = 3;
        outline.strokeColor = new Color(255, 255, 255, 230);
        outline.circle(0, 0, 42.5);
        outline.stroke();
        const text = new Node('EmptyText');
        text.layer = parent.layer;
        empty.addChild(text);
        this.layout(text, 0, 0, 90, 25);
        const label = text.addComponent(Label);
        label.string = '空位';
        label.fontSize = 22;
        label.lineHeight = 25;
        label.color = new Color(255, 255, 255, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        return empty;
    }

    private syncXqpOccupancyVisuals(occupied: boolean): void {
        const visible = this.skin === 'XQP_CIRCULAR' && occupied;
        const head = this.required('Game/Head');
        const round = this.required('Game/Head/RoundAvatar');
        const mask = this.required('Game/Head/RoundAvatar/Mask');
        const frame = this.required('Game/Head/RoundAvatar/Img_Frame');
        round.active = this.skin === 'XQP_CIRCULAR' ? occupied : round.active;
        mask.active = visible;
        frame.active = visible;
        const empty = head.getChildByName('XqpVacancy');
        if (empty) empty.active = this.skin === 'XQP_CIRCULAR' && !occupied;
        for (const name of ['NcBg', 'CentBg']) {
            const plate = this.required('Game/Head/PlayerInfo').getChildByName(name);
            if (plate) plate.active = visible;
        }
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
