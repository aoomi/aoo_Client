import { Button, EditBox, EventTouch, instantiate, Label, Node, Prefab, Tween, UITransform } from 'cc';
import { legacyPlatformBridge } from '../../../../../../Common/Code/Runtime/platform/LegacyPlatformBridge';
import type { LegacyForm, LegacyFormManager } from '../../../../../../Common/Code/Runtime/ui/LegacyFormManager';
import { CommonHeadController } from '../../../../../../Common/Code/UI/CommonHeadController';
import { AssetLoader } from '../../../../../../Common/Code/UI/Infrastructure';
import { COMMON_ASSET_BUNDLE, COMMON_HEAD_ASSET } from '../../../../../../Common/Code/Runtime/ui/CommonPrefabRegistry';
import type { CommonPdkRuntime } from './CommonPdkRuntime';
import type { CommonPdkSocialController } from './CommonPdkSocialController';
import type { PdkSeatPlayer } from './Room/SeatPresenter';

/** 玩家头像详情与魔法表情选择窗；Prefab 只保留视觉，打开和关闭均立即完成。 */
export class MagicExpressionPanelController {
    public static readonly formKey = 'room/MagicExpressionPanel';

    private readonly assets = new AssetLoader();
    private form: LegacyForm | null = null;
    private targetSeat = -1;
    private targetPlayer: PdkSeatPlayer | null = null;
    private closing = false;
    private headGeneration = 0;
    private readonly bound = new Set<Node>();

    public constructor(
        private readonly runtime: CommonPdkRuntime,
        private readonly forms: LegacyFormManager,
        private readonly social: CommonPdkSocialController,
        private readonly showMessage: (message: string) => void,
    ) {}

    public onCreate(form: LegacyForm): void {
        this.form = form;
        this.bindIfPresent('Popup/Close', () => this.close());
        this.bindIfPresent('Player/Id/Copy', () => { void this.copyPlayerId(); });
        // 预制体允许删减和重排；只绑定 MagicList 当前实际存在的按钮。
        for (const button of this.node('MagicList')?.children ?? []) {
            const match = /^Magic(\d{2})$/.exec(button.name);
            if (!match) continue;
            const expressionId = Number(match[1]);
            if (expressionId > 0) this.bindNodeIfPresent(button, () => this.send(expressionId));
        }
        form.node.on(Node.EventType.TOUCH_END, this.onRootTouchEnd, this);
        this.bound.add(form.node);
    }

    public onShow(form: LegacyForm, targetSeatValue: unknown): void {
        const targetSeat = Number(targetSeatValue);
        const clientSeat = Number(this.runtime.getRoomPosManager().GetClientPos());
        const players = this.runtime.getRoomPosManager().GetRoomAllPlayerInfo() as Readonly<Record<number, PdkSeatPlayer>>;
        const player = players?.[targetSeat];
        if (!Number.isInteger(targetSeat) || targetSeat < 0 || !Number(player?.pid ?? 0)) {
            this.forms.close(MagicExpressionPanelController.formKey);
            return;
        }
        this.form = form;
        this.targetSeat = targetSeat;
        this.targetPlayer = player;
        this.closing = false;
        this.populate(player);
        void this.mountHead(player).catch((error: unknown) => this.showMessage(
            error instanceof Error ? error.message : '公共头像加载失败',
        ));
        Tween.stopAllByTarget(form.node);
        form.node.setPosition(0, 0, form.node.position.z);
    }

    public onClose(): void {
        this.headGeneration += 1;
        this.targetSeat = -1;
        this.targetPlayer = null;
        this.closing = false;
    }

    public destroy(): void {
        this.headGeneration += 1;
        if (this.form?.node.isValid) {
            Tween.stopAllByTarget(this.form.node);
            this.form.node.off(Node.EventType.TOUCH_END, this.onRootTouchEnd, this);
            for (const node of this.bound) node.targetOff(this);
        }
        this.bound.clear();
        this.form = null;
        this.targetPlayer = null;
        this.targetSeat = -1;
    }

    private populate(player: PdkSeatPlayer): void {
        const pid = String(Number(player.pid ?? 0));
        const name = this.displayName(player);
        this.text('Player/Gender/Name', name);
        this.text('Player/Id/IdText', pid);
        const input = this.node('Player/Id/IdInput')?.getComponent(EditBox);
        if (input) input.string = pid;
        this.text('Player/Ip/Text', this.firstText(player, ['ip', 'IP', 'ipAddress']) || 'IP 未提供');
        this.text('Gps/Text', this.firstText(player, ['gps', 'location', 'address']) || '位置信息未提供');
    }

    private async mountHead(player: PdkSeatPlayer): Promise<void> {
        const form = this.form;
        const mount = this.node('Player/Head');
        if (!form || !mount) return;
        const generation = ++this.headGeneration;
        const bundle = await this.assets.bundle(COMMON_ASSET_BUNDLE);
        const prefab = await this.assets.load(COMMON_HEAD_ASSET, Prefab, bundle);
        if (generation !== this.headGeneration || !mount.isValid || !form.node.isValid) return;
        for (const child of [...mount.children]) child.destroy();
        const head = instantiate(prefab);
        mount.addChild(head);
        head.getComponent(CommonHeadController)?.useVariant('Game');
        const mountSize = mount.getComponent(UITransform)?.contentSize;
        const headTransform = head.getComponent(UITransform);
        if (mountSize && headTransform && headTransform.width > 0 && headTransform.height > 0) {
            const scale = Math.min(mountSize.width / headTransform.width, mountSize.height / headTransform.height);
            head.setScale(scale, scale, 1);
        }
        this.setHeadText(head, 'Game/Head/PlayerInfo/Lb_PlayerName', this.displayName(player));
        this.setHeadText(head, 'Game/Head/PlayerInfo/Lb_PlayerScore', String(player.totalScore ?? player.point ?? 0));
        const controller = head.getComponent(CommonHeadController);
        if (!controller) throw new Error('公共 CommonHead 缺少 CommonHeadController');
        controller.showReady(false);
        controller.hideTransientEffects();
    }

    private send(expressionId: number): void {
        const targetSeat = this.targetSeat;
        if (targetSeat < 0 || this.closing) return;
        const clientSeat = Number(this.runtime.getRoomPosManager().GetClientPos());
        const request = targetSeat === clientSeat
            ? this.social.sendMagicExpressionToAll(expressionId)
            : this.social.sendMagicExpression(targetSeat, expressionId);
        request.catch((error: unknown) => {
            this.showMessage(error instanceof Error ? error.message : '魔法表情发送失败');
        });
        this.close();
    }

    private async copyPlayerId(): Promise<void> {
        const pid = String(Number(this.targetPlayer?.pid ?? 0));
        if (pid === '0') return;
        try {
            const copied = await legacyPlatformBridge.writeClipboard(pid);
            this.showMessage(copied ? '玩家 ID 已复制' : '当前平台无法复制');
        } catch (error: unknown) {
            this.showMessage(error instanceof Error ? error.message : '复制失败');
        }
    }

    private close(): void {
        const form = this.form;
        if (!form?.node.isValid || this.closing) return;
        this.closing = true;
        Tween.stopAllByTarget(form.node);
        this.forms.close(MagicExpressionPanelController.formKey);
    }

    private readonly onRootTouchEnd = (event: EventTouch): void => {
        if (event.target === this.form?.node) this.close();
    };

    private bindIfPresent(path: string, handler: () => void): void {
        const node = this.node(path);
        if (node) this.bindNodeIfPresent(node, handler);
    }

    private bindNodeIfPresent(node: Node, handler: () => void): void {
        const button = node.getComponent(Button);
        if (!button) return;
        node.on(Button.EventType.CLICK, handler, this);
        this.bound.add(node);
    }

    private node(path: string): Node | null {
        let current = this.form?.node ?? null;
        for (const segment of path.split('/')) current = current?.getChildByName(segment) ?? null;
        return current;
    }

    private text(path: string, value: string): void {
        const label = this.node(path)?.getComponent(Label);
        if (label) label.string = value;
    }

    private setHeadText(root: Node, path: string, value: string): void {
        let current: Node | null = root;
        for (const segment of path.split('/')) current = current?.getChildByName(segment) ?? null;
        const label = current?.getComponent(Label);
        if (label) label.string = value;
    }

    private displayName(player: PdkSeatPlayer): string {
        return this.firstText(player, ['name', 'nickName', 'displayName']) || `玩家${Number(player.pid ?? 0)}`;
    }

    private firstText(player: PdkSeatPlayer, keys: readonly string[]): string {
        const record = player as Readonly<Record<string, unknown>>;
        for (const key of keys) {
            const value = String(record[key] ?? '').trim();
            if (value && value !== '0' && value.toLowerCase() !== 'label') return value;
        }
        return '';
    }
}
