import { Button, Color, Label, Node, Prefab, instantiate } from 'cc';
import { COMMON_ASSET_BUNDLE, NUMPAD_ASSET } from './CommonPrefabRegistry';
import { NumpadDotBridge, NUMPAD_DECIMAL_EVENT } from './NumpadDotBridge';

export interface NumpadCallbacks {
    close(): void;
    confirm(): void;
}

/**
 * 页面只声明值和输入约束；数字、小数点、删除与显示状态全部由公共 Numpad 维护。
 * decimalPlaces 省略或为 0 时，小数点按键不产生任何输入。
 */
export interface NumpadDigitDisplayConfig {
    digitCount: number;
    maxDigits: number;
    value(): string;
    setValue(value: string): void;
    decimalPlaces?: number;
}

export interface NumpadTitleConfig {
    title: string | (() => string);
}

export interface NumpadHandle {
    node: Node;
    refreshDigits(): void;
    dispose(): void;
}

/**
 * 所有数字键盘共用同一资源和输入状态机。业务页面只能读写最终值并声明约束，
 * 禁止再次维护 digit/backspace/clear/decimal 等按键分支。
 */
export class NumpadService {
    public async open(
        parent: Node,
        loadPrefab: () => Promise<Prefab | null>,
        callbacks: NumpadCallbacks,
        display: NumpadDigitDisplayConfig,
        titleConfig: NumpadTitleConfig,
    ): Promise<NumpadHandle | null> {
        const prefab = await loadPrefab();
        if (!prefab || !parent.isValid) return null;
        const node = instantiate(prefab);
        parent.addChild(node);
        return this.attach(node, callbacks, display, titleConfig, true);
    }

    /** 业务表单本身就是 Numpad 时直接绑定，避免再实例化第二层键盘。 */
    public attach(
        node: Node,
        callbacks: NumpadCallbacks,
        display: NumpadDigitDisplayConfig,
        titleConfig: NumpadTitleConfig,
        destroyOnDispose = false,
    ): NumpadHandle {
        const contentRoot = this.findContentRoot(node);
        let disposed = false;
        const confirmNode = this.find(contentRoot, 'Keypad/Btn_Confirm');
        if (!confirmNode) throw new Error('Numpad node contract is missing: Keypad/Btn_Confirm');
        const titleNode = this.find(contentRoot, 'Panel/Header/Title');
        if (!titleNode) throw new Error('Numpad title node contract is missing');
        for (const child of titleNode.children) child.active = false;
        const titleLabel = titleNode.getComponent(Label) ?? titleNode.addComponent(Label);
        titleNode.active = true;
        titleLabel.fontSize = 32;
        titleLabel.lineHeight = 40;
        titleLabel.color = new Color(63, 43, 28, 255);
        titleLabel.string = typeof titleConfig.title === 'function' ? titleConfig.title() : titleConfig.title;
        const refreshDigits = this.createDigitRenderer(contentRoot, display);
        const disposers: Array<() => void> = [];
        for (let value = 0; value <= 9; value += 1) this.bind(contentRoot, `Keypad/Keys/Btn_${value}`, () => {
            display.setValue(this.appendDigit(display.value(), value, display)); refreshDigits();
        }, disposers);
        this.bind(contentRoot, 'Keypad/Keys/Btn_Delete', () => { display.setValue(display.value().slice(0, -1)); refreshDigits(); }, disposers);
        this.bind(contentRoot, 'Panel/Header/Btn_Close', callbacks.close, disposers);
        this.bind(contentRoot, 'Keypad/Btn_Confirm', () => {
            if (!disposed && node.isValid) callbacks.confirm();
        }, disposers);
        if ((display.decimalPlaces ?? 0) > 0) {
            const dot = this.find(contentRoot, 'Keypad/Keys/Btn_Dot');
            if (!dot) throw new Error('Numpad node contract is missing: Keypad/Keys/Btn_Dot');
            dot.getComponent(NumpadDotBridge) ?? dot.addComponent(NumpadDotBridge);
            const invokeDecimal = (): void => { display.setValue(this.appendDecimal(display.value(), display)); refreshDigits(); };
            contentRoot.on(NUMPAD_DECIMAL_EVENT, invokeDecimal);
            disposers.push(() => { if (contentRoot.isValid) contentRoot.off(NUMPAD_DECIMAL_EVENT, invokeDecimal); });
        }
        refreshDigits();
        return {
            node,
            refreshDigits,
            dispose: () => {
                if (disposed) return;
                disposed = true;
                for (const dispose of disposers.splice(0)) dispose();
                if (destroyOnDispose && node.isValid) node.destroy();
            },
        };
    }

    private appendDigit(current: string, digit: number, display: NumpadDigitDisplayConfig): string {
        const [integer = '', fraction] = current.split('.');
        if (fraction !== undefined) {
            if (fraction.length >= (display.decimalPlaces ?? 0)) return current;
            return `${integer}.${fraction}${digit}`;
        }
        if (integer.length >= display.digitCount) return current;
        if (integer === '0') return digit === 0 ? '0' : String(digit);
        return `${integer}${digit}`;
    }

    private appendDecimal(current: string, display: NumpadDigitDisplayConfig): string {
        if ((display.decimalPlaces ?? 0) <= 0 || current.includes('.')) return current;
        return current ? `${current}.` : '0.';
    }

    private bind(root: Node, path: string, action: () => void, disposers: Array<() => void>): void {
        const node = this.find(root, path);
        if (!node) throw new Error(`Numpad node contract is missing: ${path}`);
        const listener = (): void => action();
        node.on(Button.EventType.CLICK, listener);
        disposers.push(() => { if (node.isValid) node.off(Button.EventType.CLICK, listener); });
    }

    private find(root: Node, path: string): Node | null {
        let current: Node | null = root;
        for (const part of path.split('/')) current = current?.getChildByName(part) ?? null;
        return current;
    }

    /** Form hosts may wrap a shared control; resolve the authored Numpad root by structure. */
    private findContentRoot(root: Node): Node {
        if (this.find(root, 'Panel/Header/Title') && this.find(root, 'Keypad/Display/Value')) return root;
        const pending = [...root.children];
        while (pending.length > 0) {
            const candidate = pending.shift()!;
            if (this.find(candidate, 'Panel/Header/Title') && this.find(candidate, 'Keypad/Display/Value')) return candidate;
            pending.push(...candidate.children);
        }
        return root;
    }

    private createDigitRenderer(root: Node, display: NumpadDigitDisplayConfig): () => void {
        if (!Number.isInteger(display.digitCount) || display.digitCount <= 0 || !Number.isInteger(display.maxDigits) || display.maxDigits <= 0) {
            throw new Error('Numpad digit display configuration is invalid');
        }
        const label = this.find(root, 'Keypad/Display/Value')?.getComponent(Label);
        if (!label) throw new Error('Numpad number display contract is missing');
        return () => {
            label.string = display.value().slice(0, display.maxDigits);
        };
    }
}

/** Public bundle identity retained for legacy consumers. */
export const NUMPAD_BUNDLE = COMMON_ASSET_BUNDLE;
export const NUMPAD_KEY = NUMPAD_ASSET;
