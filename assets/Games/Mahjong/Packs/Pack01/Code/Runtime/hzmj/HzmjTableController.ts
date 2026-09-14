import { Button, EditBox, instantiate, Node, Prefab, Slider, Toggle } from 'cc';
import { loadHzmjPrefab } from './HzmjPrefabLoader';
import type { HzmjRuntime } from './HzmjRuntime';

type ModalName = 'chat' | 'settings' | 'dissolve';

const modalPaths: Record<ModalName, string> = {
    chat: 'GameHzmjCommonUiHzmjUIChat',
    settings: 'GameHzmjCommonUiHzmjUISetting02',
    dissolve: 'GameHzmjCommonUiHzmjUIMessage02',
};

/** Binds migrated table/menu prefabs to their original HZMJ protocols. */
export class HzmjTableController {
    private modal: Node | null = null;
    private loading: ModalName | null = null;
    private disposed = false;
    private generation = 0;
    private requestPending = false;

    public constructor(
        private readonly root: Node,
        private readonly runtime: HzmjRuntime,
        private readonly message: (text: string) => void,
    ) {
        this.bindTableButtons();
        this.root.on('legacy-hzmj-event', this.onRoomEvent, this);
    }

    public destroy(): void {
        this.disposed = true;
        this.generation += 1;
        this.root.off('legacy-hzmj-event', this.onRoomEvent, this);
        this.closeModal();
    }

    private bindTableButtons(): void {
        this.bindNamed(this.root, 'btn_chat', () => { void this.open('chat'); });
        this.bindNamed(this.root, 'btn_shezhi', () => { void this.open('settings'); });
        this.bindNamed(this.root, 'btn_exit', () => { void this.requestDissolve(); });
        this.bindNamed(this.root, 'btn_jiesan', () => { void this.requestDissolve(); });
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
            this.root.emit('legacy-hzmj-chat-message', packet.body);
        }
    }

    private async requestDissolve(): Promise<void> {
        if (this.requestPending || this.disposed) return;
        const generation = this.generation;
        this.requestPending = true;
        this.setButtonsInteractable(this.root, false, ['btn_exit', 'btn_jiesan']);
        try {
            await this.runtime.startDissolve();
            if (this.disposed || generation !== this.generation) return;
            await this.open('dissolve');
        } catch (error: unknown) {
            if (!this.disposed && generation === this.generation) {
                this.message(error instanceof Error ? error.message : '发起解散失败');
            }
        } finally {
            if (!this.disposed && generation === this.generation) {
                this.requestPending = false;
                this.setButtonsInteractable(this.root, true, ['btn_exit', 'btn_jiesan']);
            }
        }
    }

    private async open(name: ModalName): Promise<void> {
        if (this.disposed || this.loading || this.modal?.isValid) return;
        this.loading = name;
        const generation = this.generation;
        try {
            const prefab = await this.loadPrefab(modalPaths[name]);
            if (this.disposed || generation !== this.generation || this.modal?.isValid) return;
            const modal = instantiate(prefab);
            modal.name = `HZMJ_${name}`;
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
            void this.submitModalRequest(() => this.runtime.sendChat(5, 0, content), '发送聊天失败', true);
        });
        this.walk(modal, (node) => {
            const quick = /^btn_chat(\d+)$/.exec(node.name);
            const face = /^btn_face(\d+)$/.exec(node.name);
            const id = Number(quick?.[1] ?? face?.[1] ?? 0);
            if (!id) return;
            this.bind(node, () => {
                void this.submitModalRequest(() => this.runtime.sendChat(5, id), '发送快捷聊天失败', true);
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
            slider?.node.on('slide', () => this.root.emit('legacy-hzmj-volume', { name, value: slider.progress }), this);
        }
        const viewButtons = ['btn_2d', 'btn_XY', 'btn_WZ', 'btn_YX'];
        for (const name of viewButtons) {
            this.bindNamed(modal, name, () => this.root.emit('legacy-hzmj-view-mode-request', name.slice(4).toLowerCase()));
        }
    }

    private bindDissolve(modal: Node): void {
        this.bindNamed(modal, 'btnSure', () => { void this.vote(true); });
        this.bindNamed(modal, 'btnCancel', () => { void this.vote(false); });
    }

    private async vote(agree: boolean): Promise<void> {
        await this.submitModalRequest(() => this.runtime.voteDissolve(agree), '解散投票失败', !agree);
    }

    private async submitModalRequest(request: () => Promise<unknown>, fallback: string, closeOnSuccess: boolean): Promise<void> {
        if (this.requestPending || this.disposed || !this.modal?.isValid) return;
        const generation = this.generation;
        const modal = this.modal;
        this.requestPending = true;
        this.setButtonsInteractable(modal, false);
        try {
            await request();
            if (this.disposed || generation !== this.generation || this.modal !== modal) return;
            if (closeOnSuccess) this.closeModal();
        } catch (error: unknown) {
            if (!this.disposed && generation === this.generation && this.modal === modal) {
                this.message(error instanceof Error ? error.message : fallback);
                this.setButtonsInteractable(modal, true);
            }
        } finally {
            if (!this.disposed && generation === this.generation) this.requestPending = false;
        }
    }

    private closeModal(): void {
        this.generation += 1;
        this.requestPending = false;
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

    private setButtonsInteractable(root: Node | null, interactable: boolean, names?: readonly string[]): void {
        this.walk(root, (node) => {
            if (names && !names.includes(node.name)) return;
            const button = node.getComponent(Button);
            if (button) button.interactable = interactable;
        });
    }

    private loadPrefab(path: string): Promise<Prefab> {
        return loadHzmjPrefab(path);
    }
}
