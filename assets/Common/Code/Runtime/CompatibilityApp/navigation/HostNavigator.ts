import { Button, Color, Node, Vec3 } from 'cc';
import type { AuthenticatedAccount } from '../../../../../Login/Code/Auth/AuthTypes';
import { UiFactory } from '../ui/UiFactory';

export class HostNavigator {
    public constructor(
        private readonly screen: Node,
        private readonly ui: UiFactory,
        private readonly account: AuthenticatedAccount,
    ) {}

    public showLobby(): void {
        this.ui.clearChildren(this.screen);
        this.ui.drawRect(this.screen, new Color(24, 70, 96, 255), 960, 640, 0);
        this.ui.createLabel(this.screen, 'LobbyTitle', '玖玖麻将大厅', 40, new Vec3(0, 245), Color.WHITE);
        this.ui.createLabel(
            this.screen,
            'AccountSummary',
            `账号：${this.account.account}  ID：${this.account.accountId}`,
            20,
            new Vec3(0, 195),
            new Color(207, 229, 242),
        );

        const createRoomButton = this.ui.createButton(this.screen, 'CreateRoomButton', '创建房间', new Vec3(-215, 45), 300);
        const clubButton = this.ui.createButton(this.screen, 'ClubButton', '俱乐部', new Vec3(215, 45), 300);
        const regionButton = this.ui.createButton(this.screen, 'RegionButton', '地区', new Vec3(-215, -65), 300);
        const joinRoomButton = this.ui.createButton(this.screen, 'JoinRoomButton', '加入房间', new Vec3(215, -65), 300);
        const status = this.ui.createLabel(
            this.screen,
            'LobbyStatus',
            '大厅业务正在逐项迁移',
            18,
            new Vec3(0, -210),
            new Color(207, 229, 242),
        );

        clubButton.node.on(Button.EventType.CLICK, () => this.showClub(), this);
        const notReady = (): void => { status.string = '该功能将在后续步骤接入'; };
        createRoomButton.node.on(Button.EventType.CLICK, notReady, this);
        regionButton.node.on(Button.EventType.CLICK, notReady, this);
        joinRoomButton.node.on(Button.EventType.CLICK, notReady, this);
    }

    private showClub(): void {
        this.ui.clearChildren(this.screen);
        this.ui.drawRect(this.screen, new Color(45, 61, 79, 255), 960, 640, 0);
        this.ui.createLabel(this.screen, 'ClubTitle', '俱乐部', 40, new Vec3(0, 245), Color.WHITE);
        this.ui.createLabel(
            this.screen,
            'ClubAccountSummary',
            `当前账号：${this.account.account}  ID：${this.account.accountId}`,
            20,
            new Vec3(0, 195),
            new Color(220, 228, 236),
        );
        this.ui.createLabel(
            this.screen,
            'ClubStatus',
            '俱乐部列表与业务接口将在下一步接入',
            22,
            new Vec3(0, 20),
            new Color(220, 228, 236),
        );
        const backButton = this.ui.createButton(this.screen, 'BackToLobbyButton', '返回大厅', new Vec3(0, -210), 300);
        backButton.node.on(Button.EventType.CLICK, () => this.showLobby(), this);
    }
}
