import { Button, EditBox, instantiate, Node, Prefab, resources, Slider, Toggle } from 'cc';
import type { AhhbmjRuntime } from './AhhbmjRuntime';

type ModalName = 'chat' | 'settings' | 'dissolve';

const modalPaths: Record<ModalName, string> = {
    chat: 'native-ui/game/ahhbmj/resources/ui/ahhbmj_UIChat',
    settings: 'native-ui/game/ahhbmj/resources/ui/ahhbmj_UISetting02',
    dissolve: 'native-ui/game/ahhbmj/resources/ui/ahhbmj_UIMessage02',
};

/** Binds migrated table/menu prefabs to their original AHHBMJ protocols. */
export class AhhbmjTableController {
    private modal: Node | null = null;
    private loading: ModalName | null = null;
    private disposed = false;

    public constructor(
        private readonly root: Node,
        private readonly runtime: AhhbmjRuntime,
        private readonly message: (text: string) => void,
    ) {
        this.bindTableButtons();
        this.root.on('legacy-ahhbmj-event', this.onRoomEvent, this);
    }

    public destroy(): void {
        this.disposed = true;
        this.root.off('legacy-ahhbmj-event', this.onRoomEvent, this);
        this.closeModal();
    }

    private bindTableButtons(): void {
        this.bindNamed(this.root, 'btn_chat', () => { void this.open('chat'); });
        this.bindNamed(this.root, 'btn_shezhi', () => { void this.open('settings'); });
        this.bindNamed(this.root, 'btn_exit', () => { void this.requestDissolve(); });
        this.bindNamed(this.root, 'btn_jiesan', () => { void this.requestDissolve(); });
        this.bindNamed(this.root, 'btn_ready', () => { void this.runtime.ready().catch(this.report('准备失败')); });
        this.bindNamed(this.root, 'btn_cancel', () => { void this.runtime.unready().catch(this.report('取消准备失败')); });
        this.bindNamed(this.root, 'btn_continue', () => { void this.runtime.continueGame().catch(this.report('继续游戏失败')); });
        this.bindNamed(this.root, 'btn_jixu', () => { void this.runtime.continueGame().catch(this.report('继续游戏失败')); });
        this.walk(this.root, (node) => {
            const buy = /^btn_mai(\d+)$/.exec(node.name);
            const piao = /^btn_piao(\d+)$/.exec(node.name);
            if (buy) this.bind(node, () => { void this.runtime.buyHorse(Number(buy[1])).catch(this.report('买码失败')); });
            else if (piao) this.bind(node, () => { void this.runtime.choosePiao(Number(piao[1])).catch(this.report('飘花失败')); });
            const piaoFen = /^btn_piaofen(\d+)$/.exec(node.name);
            if (piaoFen) this.bind(node, () => { void this.runtime.choosePiaoFen(Number(piaoFen[1])).catch(this.report('飘分失败')); });
        });
    }

    private report(fallback: string): (error: unknown) => void {
        return (error) => this.message(error instanceof Error ? error.message : fallback);
    }

    private onRoomEvent(payload: unknown): void {
        if (!payload || typeof payload !== 'object') return;
        const packet = payload as { event?: unknown; body?: unknown };
        const event = String(packet.event ?? '').toLowerCase();
        if (event.endsWith('startvotedissolve') || event.endsWith('posdealvote')) {
            void this.open('dissolve');
        } else if (event.endsWith('dissolveroom')) {
            this.closeModal();
            this.runtime.exit('room-dissolved');
        } else if (event.endsWith('chatmessage')) {
            this.root.emit('legacy-ahhbmj-chat-message', packet.body);
        }
    }

    private async requestDissolve(): Promise<void> {
        try {
            await this.runtime.startDissolve();
            await this.open('dissolve');
        } catch (error: unknown) {
            this.message(error instanceof Error ? error.message : '发起解散失败');
        }
    }

    private async open(name: ModalName): Promise<void> {
        if (this.disposed || this.loading || this.modal?.isValid) return;
        this.loading = name;
        try {
            const prefab = await this.loadPrefab(modalPaths[name]);
            if (this.disposed || this.modal?.isValid) return;
            const modal = instantiate(prefab);
            modal.name = `AHHBMJ_${name}`;
            this.root.addChild(modal);
            this.modal = modal;
            if (name === 'chat') this.bindChat(modal);
            else if (name === 'settings') this.bindSettings(modal);
            else this.bindDissolve(modal);
        } catch (error: unknown) {
            this.message(error instanceof Error ? error.message : `打开${name}失败`);
        } finally {
            this.loading = null;
        }
    }

    private bindChat(modal: Node): void {
        this.bindNamed(modal, 'btn_close', () => this.closeModal());
        this.bindNamed(modal, 'btn_send', () => {
            const edit = this.find(modal, 'edt_box')?.getComponent(EditBox);
            const content = edit?.string.trim() ?? '';
            if (!content) return;
            void this.runtime.sendChat(5, 0, content)
                .then(() => this.closeModal())
                .catch((error: unknown) => this.message(error instanceof Error ? error.message : '发送聊天失败'));
        });
        this.walk(modal, (node) => {
            const quick = /^btn_chat(\d+)$/.exec(node.name);
            const face = /^btn_face(\d+)$/.exec(node.name);
            const id = Number(quick?.[1] ?? face?.[1] ?? 0);
            if (!id) return;
            this.bind(node, () => {
                void this.runtime.sendChat(5, id).then(() => this.closeModal())
                    .catch((error: unknown) => this.message(error instanceof Error ? error.message : '发送快捷聊天失败'));
            });
        });
    }

    private bindSettings(modal: Node): void {
        this.bindNamed(modal, 'btn_close', () => this.closeModal());
        this.bindNamed(modal, 'btn_tuichu', () => {
            this.closeModal();
            this.runtime.exit('settings-exit');
        });
        this.bindNamed(modal, 'btn_jiesan', () => { this.closeModal(); void this.requestDissolve(); });
        for (const name of ['btn_toggle1', 'btn_toggle2']) {
            this.bindNamed(modal, name, (node) => {
                const toggle = node.getComponent(Toggle);
                if (toggle) toggle.isChecked = !toggle.isChecked;
            });
        }
        for (const name of ['sd_yinyue', 'sd_yinxiao']) {
            const slider = this.find(modal, name)?.getComponent(Slider);
            slider?.node.on('slide', () => this.root.emit('legacy-ahhbmj-volume', { name, value: slider.progress }), this);
        }
        const viewButtons = ['btn_2d', 'btn_XY', 'btn_WZ', 'btn_YF'];
        for (const name of viewButtons) {
            this.bindNamed(modal, name, () => this.root.emit('legacy-ahhbmj-view-mode-request', name.slice(4).toLowerCase()));
        }
    }

    private bindDissolve(modal: Node): void {
        this.bindNamed(modal, 'btnSure', () => { void this.vote(true); });
        this.bindNamed(modal, 'btnCancel', () => { void this.vote(false); });
    }

    private async vote(agree: boolean): Promise<void> {
        try {
            await this.runtime.voteDissolve(agree);
            this.walk(this.modal, (node) => {
                const button = node.getComponent(Button);
                if (button) button.interactable = false;
            });
            if (!agree) this.closeModal();
        } catch (error: unknown) {
            this.message(error instanceof Error ? error.message : '解散投票失败');
        }
    }

    private closeModal(): void {
        this.modal?.destroy();
        this.modal = null;
        this.loading = null;
    }

    private bindNamed(root: Node | null, name: string, listener: (node: Node) => void): void {
        const node = this.find(root, name);
        if (node) this.bind(node, () => listener(node));
    }

    private bind(node: Node, listener: () => void): void {
        node.getComponent(Button) ?? node.addComponent(Button);
        node.on(Button.EventType.CLICK, listener, this);
    }

    private find(root: Node | null, name: string): Node | null {
        if (!root) return null;
        if (root.name === name) return root;
        for (const child of root.children) {
            const match = this.find(child, name);
            if (match) return match;
        }
        return null;
    }

    private walk(root: Node | null, visit: (node: Node) => void): void {
        if (!root) return;
        visit(root);
        for (const child of root.children) this.walk(child, visit);
    }

    private loadPrefab(path: string): Promise<Prefab> {
        return new Promise((resolve, reject) => {
            resources.load(path, Prefab, (error, prefab) => error ? reject(error) : resolve(prefab));
        });
    }
}
