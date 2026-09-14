import {
    Button,
    Color,
    EditBox,
    Label,
    Node,
    resources,
    Sprite,
    SpriteFrame,
    UITransform,
    Vec3,
} from 'cc';
import { UiFactory } from '../../../Common/Code/Runtime/ui/UiFactory';
import { LoginView } from './LoginView';

interface LegacyLoginAssets {
    background: SpriteFrame;
    logo: SpriteFrame;
    panel: SpriteFrame;
    input: SpriteFrame;
    button: SpriteFrame;
}

export class LegacyLoginScreen {
    public constructor(private readonly ui: UiFactory) {}

    public async mount(parent: Node): Promise<LoginView> {
        const assets = await this.loadAssets();
        const screen = this.ui.createNode('LoginScreen', parent, 1360, 760);
        this.createSprite(screen, 'Background', assets.background, 1920, 1080, Vec3.ZERO);

        const form = this.ui.createNode('UILogin', screen, 560, 220);
        form.setPosition(new Vec3(0, -170));
        this.createSprite(form, 'Logo', assets.logo, 766, 273, new Vec3(0, 357.275));
        this.createSprite(form, 'PanelBackground', assets.panel, 560, 220, Vec3.ZERO, true, [7, 8, 8, 8]);
        this.createSprite(form, 'AccountInputBackground', assets.input, 400, 38, new Vec3(2, 55), true, [15, 17, 13, 13]);
        this.createSprite(form, 'PasswordInputBackground', assets.input, 400, 38, new Vec3(3, 4), true, [15, 17, 13, 13]);

        const accountInput = this.createLegacyEditBox(
            form,
            'AccountInput',
            '请输入账号...',
            new Vec3(5, 55),
            false,
        );
        const passwordInput = this.createLegacyEditBox(
            form,
            'PasswordInput',
            '请输入密码...',
            new Vec3(5, 5),
            true,
        );
        this.createLegacyLabel(form, 'LabelAccount', '账号:', 26, new Vec3(-160, 54), 60.91, 41.06);
        this.createLegacyLabel(form, 'PasswordLabel', '密码:', 26, new Vec3(-160, 4), 60.91, 41.06);

        const accountLoginButton = this.createLegacyButton(
            form,
            'Btn_Login',
            '账号登陆',
            new Vec3(126.932, -42.93),
            assets,
        );
        const guestLoginButton = this.createLegacyButton(
            form,
            'Btn_GuestLogin',
            '游客登录',
            new Vec3(-112.397, -46.573),
            assets,
        );
        const messageLabel = this.createLegacyLabel(form, 'Message', '', 18, new Vec3(0, -95));
        messageLabel.color = new Color(255, 220, 150, 255);

        const view = form.addComponent(LoginView);
        view.accountInput = accountInput;
        view.passwordInput = passwordInput;
        view.loginButton = accountLoginButton;
        view.guestLoginButton = guestLoginButton;
        view.initializeFromStore();
        this.bindLegacyButton(accountLoginButton.node, () => void view.onLoginClicked(), view);
        this.bindLegacyButton(guestLoginButton.node, () => void view.onGuestLoginClicked(), view);
        return view;
    }

    private bindLegacyButton(buttonNode: Node, callback: () => void, target: unknown): void {
        let lastFire = 0;
        const guarded = (): void => {
            const now = Date.now();
            if (now - lastFire < 180) return;
            lastFire = now;
            callback.call(target);
        };
        buttonNode.on(Button.EventType.CLICK, guarded, target);
        buttonNode.on(Node.EventType.TOUCH_END, guarded, target);
        buttonNode.on(Node.EventType.MOUSE_UP, guarded, target);
    }

    private async loadAssets(): Promise<LegacyLoginAssets> {
        const [background, logo, panel, input, button] = await Promise.all([
            this.load('legacy-ui/login/bg_bj01/spriteFrame', SpriteFrame),
            this.load('legacy-ui/login/logo/spriteFrame', SpriteFrame),
            this.load('legacy-ui/login/xinxikuang/spriteFrame', SpriteFrame),
            this.load('legacy-ui/login/wupingdikuang/spriteFrame', SpriteFrame),
            this.load('legacy-ui/login/anniu/spriteFrame', SpriteFrame),
        ]);
        return { background, logo, panel, input, button };
    }

    private load<T>(path: string, type: new (...args: never[]) => T): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            resources.load(path, type as unknown as typeof import('cc').Asset, (error, asset) => {
                if (error || !asset) reject(error ?? new Error(`资源不存在：${path}`));
                else resolve(asset as unknown as T);
            });
        });
    }

    private createSprite(
        parent: Node,
        name: string,
        frame: SpriteFrame,
        width: number,
        height: number,
        position: Vec3,
        sliced = false,
        insets?: [number, number, number, number],
    ): Sprite {
        const node = this.ui.createNode(name, parent, width, height);
        node.setPosition(position);
        const frameInstance = insets ? frame.clone() : frame;
        if (insets) {
            [frameInstance.insetLeft, frameInstance.insetRight, frameInstance.insetTop, frameInstance.insetBottom] = insets;
        }
        const sprite = node.addComponent(Sprite);
        sprite.spriteFrame = frameInstance;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = sliced ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
        return sprite;
    }

    private createLegacyLabel(
        parent: Node,
        name: string,
        text: string,
        fontSize: number,
        position: Vec3,
        width = 440,
        height = fontSize + 18,
    ): Label {
        const label = this.ui.createLabel(parent, name, text, fontSize, position, Color.WHITE);
        label.node.getComponent(UITransform)?.setContentSize(width, height);
        label.enableOutline = true;
        label.outlineColor = new Color(74, 38, 14, 255);
        label.outlineWidth = 2;
        return label;
    }

    private createLegacyEditBox(
        parent: Node,
        name: string,
        placeholder: string,
        position: Vec3,
        password: boolean,
    ): EditBox {
        const node = this.ui.createNode(name, parent, 250, 30);
        node.setPosition(position);
        const textLabel = this.createLegacyLabel(node, 'InputTextLabel', '', 29, new Vec3(-123, 15));
        const placeholderLabel = this.createLegacyLabel(
            node,
            'InputPlaceholderLabel',
            placeholder,
            20,
            new Vec3(-123, 15),
        );
        textLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        placeholderLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        const textTransform = textLabel.node.getComponent(UITransform);
        const placeholderTransform = placeholderLabel.node.getComponent(UITransform);
        textTransform?.setContentSize(248, 30);
        placeholderTransform?.setContentSize(248, 30);
        textTransform?.setAnchorPoint(0, 1);
        placeholderTransform?.setAnchorPoint(0, 1);
        const editBox = node.addComponent(EditBox);
        editBox.textLabel = textLabel;
        editBox.placeholderLabel = placeholderLabel;
        editBox.inputFlag = password ? EditBox.InputFlag.PASSWORD : EditBox.InputFlag.DEFAULT;
        return editBox;
    }

    private createLegacyButton(
        parent: Node,
        name: string,
        text: string,
        position: Vec3,
        assets: LegacyLoginAssets,
    ): Button {
        const sprite = this.createSprite(parent, name, assets.button, 150, 50, position);
        this.createLegacyLabel(sprite.node, 'Label', text, 26, Vec3.ZERO, 150, 50);
        const button = sprite.node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.96;
        return button;
    }
}
