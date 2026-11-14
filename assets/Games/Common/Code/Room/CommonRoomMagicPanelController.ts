import { Button, EditBox, EventTouch, Label, Node, Tween } from 'cc';
import { legacyPlatformBridge } from '../../../../Common/Code/Runtime/platform/LegacyPlatformBridge';
import { AssetLoader } from '../../../../Common/Code/UI/Infrastructure';
import type { CommonRoomPublicSeat, CommonRoomPublicView } from '../Runtime/GameRuntimeEntry';
import type { CommonRoomFormHandle, CommonRoomFormHost } from './RoomNetworkControllerMount';
import type { CommonRoomSocialController } from './CommonRoomSocialController';
import { mountCommonRoomHead } from './CommonRoomHeadMount';

const MAGIC_PANEL_FORM = 'room/MagicExpressionPanel';

/**
 * Common-owned MagicPanel lifecycle.  Gameplay supplies no form, head or
 * transport implementation; it only publishes the public seat projection that
 * this controller validates before opening the panel.
 */
export class CommonRoomMagicPanelController {
    private readonly assets = new AssetLoader();
    private form: CommonRoomFormHandle | null = null;
    private targetSeat = -1;
    private targetPlayer: CommonRoomPublicSeat | null = null;
    private generation = 0;
    private closing = false;
    private sequence = 0;
    private readonly bound = new Set<Node>();

    public constructor(
        private readonly formHost: CommonRoomFormHost,
        private readonly social: CommonRoomSocialController,
        private readonly publicView: () => CommonRoomPublicView | null,
        private readonly report: (error: unknown) => void,
    ) {}

    public async open(targetSeat: number): Promise<void> {
        const view = this.publicView();
        const target = view?.seats.find(seat => seat.seatId === targetSeat && seat.occupied);
        if (!view || !target) throw new Error('COMMON_ROOM_MAGIC_TARGET_INVALID');
        this.close();
        const form = await this.formHost.show(MAGIC_PANEL_FORM, targetSeat);
        if (!form?.node.isValid) throw new Error('COMMON_ROOM_MAGIC_PANEL_REQUIRED');
        this.form = form;
        this.targetSeat = targetSeat;
        this.targetPlayer = target;
        this.closing = false;
        this.populate(target);
        this.bind(form);
        await this.mountHead(target);
        if (this.form === form && form.node.isValid) {
            Tween.stopAllByTarget(form.node);
            form.node.setPosition(0, 0, form.node.position.z);
        }
    }

    public close(): void {
        this.generation += 1;
        this.closing = true;
        const form = this.form;
        if (form?.node.isValid) Tween.stopAllByTarget(form.node);
        this.formHost.close(MAGIC_PANEL_FORM);
        this.unbind();
        this.form = null;
        this.targetSeat = -1;
        this.targetPlayer = null;
    }

    public destroy(): void {
        this.close();
        this.assets.releaseAll();
    }

    private bind(form: CommonRoomFormHandle): void {
        const close = form.find('Popup/Close');
        if (close?.getComponent(Button)) this.bindNode(close, () => this.close());
        const copy = form.find('Player/Id/Copy');
        if (copy?.getComponent(Button)) this.bindNode(copy, () => { void this.copyPlayerId(); });
        for (const button of form.find('MagicList')?.children ?? []) {
            const match = /^Magic(\d{2})$/.exec(button.name);
            if (!match) continue;
            const expressionId = Number(match[1]);
            if (expressionId > 0 && button.getComponent(Button)) {
                this.bindNode(button, () => { void this.send(expressionId); });
            }
        }
        form.node.on(Node.EventType.TOUCH_END, this.onRootTouchEnd, this);
        this.bound.add(form.node);
    }

    private unbind(): void {
        for (const node of this.bound) {
            if (node.isValid) node.targetOff(this);
        }
        this.bound.clear();
    }

    private bindNode(node: Node, handler: () => void): void {
        node.on(Button.EventType.CLICK, handler, this);
        this.bound.add(node);
    }

    private populate(player: CommonRoomPublicSeat): void {
        const form = this.form;
        if (!form) return;
        const pid = String(Number(player.playerId ?? 0));
        this.text(form.find('Player/Gender/Name'), player.displayName ?? `玩家${pid}`);
        this.text(form.find('Player/Id/IdText'), pid);
        const input = form.find('Player/Id/IdInput')?.getComponent(EditBox);
        if (input) input.string = pid;
        this.text(form.find('Player/Ip/Text'), 'IP 未提供');
        this.text(form.find('Gps/Text'), '位置信息未提供');
    }

    private async mountHead(player: CommonRoomPublicSeat): Promise<void> {
        const form = this.form;
        const mount = form?.find('Player/Head');
        if (!form || !mount) return;
        const generation = ++this.generation;
        if (generation !== this.generation || !mount.isValid || !form.node.isValid) return;
        const mounted = await mountCommonRoomHead(mount, this.assets, 'Game',
            () => generation === this.generation && !this.closing);
        if (generation !== this.generation || !mount.isValid || !form.node.isValid) return;
        const head = mounted.node;
        this.setHeadText(head, 'Game/Head/PlayerInfo/Lb_PlayerName', player.displayName ?? '');
        this.setHeadText(head, 'Game/Head/PlayerInfo/Lb_PlayerScore', String(player.score ?? 0));
        const controller = mounted.controller;
        controller.showReady(false);
        controller.hideTransientEffects();
    }

    private async send(expressionId: number): Promise<void> {
        const view = this.publicView();
        const targetSeat = this.targetSeat;
        if (this.closing || !view || targetSeat < 0) return;
        if (!Number.isInteger(expressionId) || expressionId < 1 || expressionId > 20) {
            throw new Error('COMMON_ROOM_MAGIC_EXPRESSION_INVALID');
        }
        const targets = targetSeat === view.localSeatId
            ? view.seats.filter(seat => seat.occupied && seat.seatId !== view.localSeatId).map(seat => seat.seatId)
            : [targetSeat];
        if (targets.length === 0) throw new Error('COMMON_ROOM_MAGIC_TARGET_EMPTY');
        try {
            await Promise.all(targets.map((seat, index) => this.social.send(
                'magic.expression', { targetSeatId: seat, expressionId },
                `magic:${targetSeat}:${expressionId}:${++this.sequence + index}`,
            )));
        } catch (error) {
            this.report(error);
            throw error;
        } finally {
            this.close();
        }
    }

    private async copyPlayerId(): Promise<void> {
        const pid = String(Number(this.targetPlayer?.playerId ?? 0));
        if (pid === '0') return;
        try {
            const copied = await legacyPlatformBridge.writeClipboard(pid);
            this.report(copied ? undefined : new Error('当前平台无法复制'));
        } catch (error) {
            this.report(error);
        }
    }

    private readonly onRootTouchEnd = (event: EventTouch): void => {
        if (event.target === this.form?.node) this.close();
    };

    private text(node: Node | null, value: string): void {
        const label = node?.getComponent(Label);
        if (label) label.string = value;
    }

    private setHeadText(root: Node, path: string, value: string): void {
        let current: Node | null = root;
        for (const segment of path.split('/')) current = current?.getChildByName(segment) ?? null;
        this.text(current, value);
    }
}
