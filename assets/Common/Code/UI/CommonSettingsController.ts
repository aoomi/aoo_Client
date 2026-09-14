import { Button, Node, Slider, Toggle } from 'cc';
import { legacyAudioService } from '../Runtime/core/LegacyAudioService';
import { legacyLocalDataStore } from '../Runtime/core/LegacyLocalDataStore';

type SettingsCategory = 'general' | 'poker';

/** Owns the behavior of the single shared SettingsPanel prefab. */
export class CommonSettingsController {
    private readonly disposers: Array<() => void> = [];
    private root: Node | null = null;

    public constructor(private readonly close: () => void) {}

    public onCreate(root: Node): void {
        this.destroy();
        this.root = root;
        this.click('Panel/CloseButton', this.close);
        this.click('CategoryTabs/GeneralTabButton', () => this.showCategory('general'));
        this.click('CategoryTabs/PokerTabButton', () => this.showCategory('poker'));
        // The authored prefab currently exposes only shared and poker-specific panels.
        // Mahjong and long-card tabs therefore fall back to the shared settings instead
        // of becoming visible buttons with no behavior.
        this.click('CategoryTabs/MahjongTabButton', () => this.showCategory('general'));
        this.click('CategoryTabs/LongCardTabButton', () => this.showCategory('general'));
        this.slider('GeneralSettings/MusicVolume/Slider', 'BackVolume');
        this.slider('GeneralSettings/EffectsVolume/Slider', 'SpVolume');
        this.toggleGroup('GeneralSettings/MusicTheme', ['ClassicalToggle', 'JoyfulToggle', 'ModernToggle'], 'MusicTheme');
        this.selectionGroup('PokerSettings/LayoutOptions/Viewport/Options', ['LayoutOption1', 'LayoutOption2'], 'PokerLayout');
        this.selectionGroup('PokerSettings/CardFaceOptions', ['CardFaceOption1', 'CardFaceOption2', 'CardFaceOption3'], 'PokerCardFace');
        this.selectionGroup('PokerSettings/CardBackOptions', ['CardBackOption1', 'CardBackOption2', 'CardBackOption3'], 'PokerCardBack');
    }

    public onShow(category: SettingsCategory = 'general'): void {
        this.showCategory(category);
        this.renderSlider('GeneralSettings/MusicVolume/Slider', 'BackVolume');
        this.renderSlider('GeneralSettings/EffectsVolume/Slider', 'SpVolume');
        this.renderToggleGroup('GeneralSettings/MusicTheme', ['ClassicalToggle', 'JoyfulToggle', 'ModernToggle'], 'MusicTheme');
        this.renderSelectionGroup('PokerSettings/LayoutOptions/Viewport/Options', ['LayoutOption1', 'LayoutOption2'], 'PokerLayout');
        this.renderSelectionGroup('PokerSettings/CardFaceOptions', ['CardFaceOption1', 'CardFaceOption2', 'CardFaceOption3'], 'PokerCardFace');
        this.renderSelectionGroup('PokerSettings/CardBackOptions', ['CardBackOption1', 'CardBackOption2', 'CardBackOption3'], 'PokerCardBack');
    }

    public destroy(): void {
        for (const dispose of this.disposers.splice(0)) dispose();
        this.root = null;
    }

    private showCategory(category: SettingsCategory): void {
        this.active('GeneralSettings', category === 'general');
        this.active('PokerSettings', category === 'poker');
    }

    private slider(path: string, key: 'BackVolume' | 'SpVolume'): void {
        const slider = this.find(path)?.getComponent(Slider);
        if (!slider) return;
        const changed = (): void => {
            legacyLocalDataStore.set('SysSetting', key, slider.progress);
            legacyLocalDataStore.set('SysSetting', key === 'BackVolume' ? 'BackMusic' : 'SpSound', slider.progress > 0 ? 1 : 0);
            legacyAudioService.applySettings();
        };
        slider.node.on('slide', changed, this);
        this.disposers.push(() => slider.node.isValid && slider.node.off('slide', changed, this));
    }

    private toggleGroup(parent: string, names: readonly string[], key: string): void {
        names.forEach((name, index) => {
            const toggle = this.find(`${parent}/${name}`)?.getComponent(Toggle);
            if (!toggle) return;
            const changed = (): void => {
                if (toggle.isChecked) legacyLocalDataStore.set('SysSetting', key, index);
            };
            toggle.node.on(Toggle.EventType.TOGGLE, changed, this);
            this.disposers.push(() => toggle.node.isValid && toggle.node.off(Toggle.EventType.TOGGLE, changed, this));
        });
    }

    private selectionGroup(parent: string, names: readonly string[], key: string): void {
        names.forEach((name, index) => this.click(`${parent}/${name}`, () => {
            legacyLocalDataStore.set('SysSetting', key, index);
            this.renderSelectionGroup(parent, names, key);
        }));
    }

    private renderSlider(path: string, key: 'BackVolume' | 'SpVolume'): void {
        const slider = this.find(path)?.getComponent(Slider);
        if (slider) slider.progress = this.storedNumber(key, 1, 1);
    }

    private renderToggleGroup(parent: string, names: readonly string[], key: string): void {
        const selected = this.storedNumber(key, 0, names.length - 1);
        names.forEach((name, index) => {
            const toggle = this.find(`${parent}/${name}`)?.getComponent(Toggle);
            if (toggle) toggle.isChecked = index === selected;
        });
    }

    private renderSelectionGroup(parent: string, names: readonly string[], key: string): void {
        const selected = this.storedNumber(key, 0, names.length - 1);
        names.forEach((name, index) => this.active(`${parent}/${name}/SelectionMark`, index === selected));
    }

    private storedNumber(key: string, fallback: number, maximum: number): number {
        const value = Number(legacyLocalDataStore.get('SysSetting', key, fallback));
        return Math.max(0, Math.min(maximum, Number.isFinite(value) ? value : fallback));
    }

    private click(path: string, listener: () => void): void {
        const node = this.find(path);
        if (!node) throw new Error(`SettingsPanel 节点缺失: ${path}`);
        const button = node.getComponent(Button);
        if (!button) throw new Error(`SettingsPanel 按钮组件缺失: ${path}`);
        node.on(Button.EventType.CLICK, listener, this);
        this.disposers.push(() => node.isValid && node.off(Button.EventType.CLICK, listener, this));
    }

    private active(path: string, active: boolean): void {
        const node = this.find(path);
        if (node) node.active = active;
    }

    private find(path: string): Node | null {
        let current = this.root;
        for (const segment of path.split('/')) current = current?.getChildByName(segment) ?? null;
        return current;
    }
}
