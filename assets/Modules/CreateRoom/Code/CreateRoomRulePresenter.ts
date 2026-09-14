import { Label, Layout, Node, ScrollView, Toggle, UITransform, instantiate } from 'cc';
import { UnifiedScroll } from '../../../Common/Code/UI/UnifiedScroll';
import type { HallRoomRuleField, HallRoomRuleOption } from '../../../Lobby/Code/HallRoomGateway';

export interface RuleValidationResult { readonly ok: boolean; readonly message: string; }
type RuleControl = 'radio' | 'checkbox';
type RuleOption = HallRoomRuleOption | string | number | boolean;
interface OptionPlacement { readonly x: number; readonly y: number; readonly width: number; readonly visualRows: number; }

/** 唯一规则渲染器：几何参数全部继承用户维护的 TemplateRoot，代码不写回 Prefab。 */
export class CreateRoomRulePresenter {
    private readonly content: Node;
    private readonly templateRoot: Node;
    private fields: readonly HallRoomRuleField[] = [];
    private readonly values = new Map<string, unknown>();
    private readonly runtimeRows: Node[] = [];

    public constructor(rulesPanel: Node | null) {
        if (!rulesPanel) throw new Error('创建房间规则面板缺失');
        const content = this.findPath(rulesPanel, 'ScrollView/Viewport/Content');
        if (!content) throw new Error('创建房间规则 Prefab 缺少 content');
        // The restored Lobby prefab deliberately has no serialized rule-row template.  Keep the
        // prefab untouched and provide the equivalent runtime-only template for schema rows.
        const templateRoot = rulesPanel.getChildByName('TemplateRoot');
        if (!templateRoot) throw new Error('创建房间规则 Prefab 缺少 TemplateRoot');
        for (const name of ['Label', 'RadioOption', 'CheckboxOption', 'Divider']) {
            if (!templateRoot.getChildByName(name)) throw new Error(`创建房间规则模板节点缺失: ${name}`);
        }
        this.content = content;
        this.templateRoot = templateRoot;
        this.templateRoot.active = false;
        this.content.active = true;
        const contentLayout = this.content.getComponent(Layout);
        if (contentLayout) contentLayout.paddingBottom = Math.max(contentLayout.paddingBottom, 72);
        const scrollNode = this.findPath(rulesPanel, 'ScrollView');
        if (!scrollNode?.getComponent(ScrollView)) throw new Error('创建房间规则 ScrollView 组件缺失');
        UnifiedScroll.ensure(scrollNode);
    }

    public setSchema(fields: readonly HallRoomRuleField[], remembered: Record<string, unknown> | null = null): void {
        this.fields = fields.filter(field => field.visible !== false)
            .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0));
        this.initializeValues(remembered); this.render();
    }
    public reset(): void {
        this.initializeValues(null); this.render();
    }
    public snapshot(): Record<string, unknown> {
        return Object.fromEntries(this.fields.filter(field => !field.disabled && this.values.has(field.key))
            .map(field => [field.key, this.values.get(field.key)]));
    }
    public validate(): RuleValidationResult {
        for (const field of this.fields) {
            if (field.disabled) continue;
            const value = this.values.get(field.key);
            if (field.required && (value === undefined || (Array.isArray(value) && value.length === 0))) return { ok: false, message: `请选择${this.fieldLabel(field)}` };
            if (value === undefined) continue;
            if (this.control(field) === 'checkbox') {
                if (!Array.isArray(value) || value.some(item => !this.hasEnabledOption(field, item))) return { ok: false, message: `${this.fieldLabel(field)}包含不可用选项` };
            } else if (!this.hasEnabledOption(field, value)) return { ok: false, message: `${this.fieldLabel(field)}选项无效` };
        }
        return { ok: true, message: '' };
    }
    public clear(): void { for (const row of this.runtimeRows.splice(0)) if (row.isValid) row.destroy(); this.fields = []; this.values.clear(); }
    public destroy(): void { this.clear(); }

    private render(): void {
        for (const row of this.runtimeRows.splice(0)) if (row.isValid) row.destroy();
        for (const field of this.fields) {
            const row = instantiate(this.templateRoot); row.name = `Rule_${field.key}`; row.active = true;
            const category = row.getChildByName('Label');
            const radio = row.getChildByName('RadioOption'); const checkbox = row.getChildByName('CheckboxOption');
            const label = category?.getComponent(Label);
            if (!category || !label || !radio || !checkbox) throw new Error(`规则模板节点契约无效: ${field.key}`);
            const categoryNode = category;
            label.string = this.fieldLabel(field); radio.active = false; checkbox.active = false;
            const prototype = this.control(field) === 'checkbox' ? checkbox : radio;
            const options = field.options ?? [];
            const draftPlacements = this.layoutOptions(row, categoryNode, prototype, options);
            this.resizeRuntimeRow(row, draftPlacements[0]?.visualRows ?? 1);
            const placements = this.layoutOptions(row, categoryNode, prototype, options);
            options.forEach((option, index) => this.appendOption(row, prototype, field, option, placements[index]));
            this.content.addChild(row); this.runtimeRows.push(row);
        }
        this.content.getComponent(Layout)?.updateLayout(true);
    }
    private resizeRuntimeRow(row: Node, visualRows: number): void {
        const rowTransform = row.getComponent(UITransform);
        const templateTransform = this.templateRoot.getComponent(UITransform);
        const divider = row.getChildByName('Divider');
        if (!rowTransform || !templateTransform || templateTransform.height <= 0 || !divider) {
            throw new Error('创建房间规则模板行高或分隔线无效');
        }
        const addedHeight = templateTransform.height * (visualRows - 1);
        rowTransform.setContentSize(templateTransform.width, templateTransform.height * visualRows);
        // 扩高会围绕行节点锚点改变上下边界；若不补偿，首行会留在扩展组的中部并在顶部产生半行空白。
        // 这里保持原顶部边界不动，分类标题与选项继续占第一子行，分隔线落到最后一行底部。
        const firstLineOffset = addedHeight * (1 - rowTransform.anchorY);
        const category = row.getChildByName('Label');
        if (!category) throw new Error('创建房间规则分类模板缺失');
        category.setPosition(category.position.x, category.position.y + firstLineOffset, category.position.z);
        divider.setPosition(divider.position.x, divider.position.y + firstLineOffset - addedHeight, divider.position.z);
    }
    private layoutOptions(row: Node, category: Node, prototype: Node, options: readonly RuleOption[]): OptionPlacement[] {
        const rowTransform = row.getComponent(UITransform);
        const prototypeTransform = prototype.getComponent(UITransform);
        const textLabel = prototype.getChildByName('Label')?.getComponent(Label);
        if (!rowTransform || !prototypeTransform || !textLabel || prototypeTransform.width <= 0) {
            throw new Error(`规则选项模板尺寸无效: ${prototype.name}`);
        }
        // The legacy toggle artwork is wider than its serialized UITransform. Keep an extra
        // visual gutter so adjacent Chinese labels and the next checkbox sprite never collide.
        const spacing = (this.templateRoot.getComponent(Layout)?.spacingX ?? 0) + 24;
        const rowHeight = this.templateRoot.getComponent(UITransform)?.height ?? 0;
        if (rowHeight <= 0) throw new Error('创建房间规则模板行高无效');
        const left = prototype.position.x - prototypeTransform.width * prototypeTransform.anchorX;
        const viewportWidth = this.content.parent?.getComponent(UITransform)?.width ?? rowTransform.width;
        const usableWidth = Math.min(rowTransform.width, viewportWidth);
        // The scroll mask is narrower than the historical template row. Reserve its right inset
        // so long Chinese labels stay fully visible instead of being clipped at the mask edge.
        const right = usableWidth * (1 - rowTransform.anchorX) - spacing - 120;
        const availableWidth = Math.max(prototypeTransform.width, right - left);
        const widths = options.map(option => Math.min(availableWidth,
            Math.max(prototypeTransform.width, this.estimatedLabelWidth(this.optionLabel(option), textLabel.fontSize) + 24)));
        const rows: Array<{ x: number; y: number; width: number }> = [];
        let cursor = left; let visualRow = 0;
        for (const width of widths) {
            if (cursor > left && cursor + width > right) {
                visualRow += 1; cursor = left;
            }
            // Keep the toggle artwork anchored to the same left edge even when a long label
            // expands the item's hit area. Centering by the expanded width shifts first items
            // such as “全单…” and “距离过近警告” visibly to the right.
            rows.push({ x: cursor + prototypeTransform.width / 2, y: category.position.y - visualRow * rowHeight, width });
            cursor += width + spacing;
        }
        const visualRows = Math.max(1, visualRow + 1);
        return rows.map(item => ({ ...item, visualRows }));
    }
    private appendOption(row: Node, prototype: Node, field: HallRoomRuleField, option: RuleOption, placement: OptionPlacement): void {
        const value = this.optionValue(option);
        const item = instantiate(prototype); item.name = `Option_${field.key}_${String(value)}`; item.active = true;
        const itemTransform = item.getComponent(UITransform);
        if (!itemTransform) throw new Error(`规则模板宽度无效: ${prototype.name}`);
        itemTransform.setContentSize(placement.width, itemTransform.height);
        item.setPosition(placement.x, placement.y, prototype.position.z);
        const label = item.getChildByName('Label')?.getComponent(Label); const toggle = item.getComponent(Toggle);
        if (!label || !toggle) throw new Error(`规则选项模板契约无效: ${field.key}`);
        label.node.getComponent(UITransform)?.setContentSize(Math.max(1, placement.width - 10), label.node.getComponent(UITransform)?.height ?? 40);
        label.string = this.optionLabel(option); const disabled = Boolean(field.disabled || this.optionDisabled(option));
        toggle.isChecked = this.isSelected(field, option); toggle.interactable = !disabled; this.applyState(item, toggle.isChecked);
        if (!disabled) item.on(Toggle.EventType.TOGGLE, () => this.choose(field, option), this);
        row.addChild(item);
    }
    private applyState(item: Node, selected: boolean): void {
        const selectedNode = item.getChildByName('Icon_Selected'); const unselectedNode = item.getChildByName('Icon_Unselected');
        if (selectedNode) selectedNode.active = selected; if (unselectedNode) unselectedNode.active = !selected;
    }
    private choose(field: HallRoomRuleField, option: RuleOption): void {
        if (field.disabled || this.optionDisabled(option)) return;
        const optionValue = this.optionValue(option);
        if (this.control(field) === 'checkbox') {
            const current = Array.isArray(this.values.get(field.key)) ? [...this.values.get(field.key) as unknown[]] : [];
            const index = current.findIndex(value => String(value) === String(optionValue));
            if (index >= 0) current.splice(index, 1); else current.push(optionValue); this.values.set(field.key, current);
        } else this.values.set(field.key, optionValue);
        this.reconcileDependencies();
        this.render();
    }
    private defaultValue(field: HallRoomRuleField): unknown {
        const candidates = field.defaultCandidateIndexes ?? [];
        if (candidates.length) {
            const options = field.options ?? [];
            const selected = candidates.map(index => options[index - 1]).filter(Boolean);
            return this.control(field) === 'checkbox' ? selected.map(option => this.optionValue(option))
                : selected.length ? this.optionValue(selected[0]) : undefined;
        }
        if (field.defaultValue !== undefined) return field.defaultValue;
        return this.control(field) === 'checkbox' ? [] : undefined;
    }
    private initializeValues(remembered: Record<string, unknown> | null): void {
        this.values.clear();
        for (const field of this.fields) {
            const fallback = this.defaultValue(field);
            // Read-only published choices still need their authoritative default rendered.
            // They remain absent from snapshot(), so the client cannot submit or override them.
            if (field.disabled) {
                if (fallback !== undefined) this.values.set(field.key, fallback);
                continue;
            }
            const saved = remembered?.[field.key];
            if (this.control(field) === 'checkbox') {
                const projected = Array.isArray(saved) ? saved.filter(value => this.hasEnabledOption(field, value)) : null;
                this.values.set(field.key, projected ?? (Array.isArray(fallback) ? fallback : []));
            } else if (saved !== undefined && this.hasEnabledOption(field, saved)) this.values.set(field.key, saved);
            else if (fallback !== undefined) this.values.set(field.key, fallback);
        }
        this.reconcileDependencies();
    }
    /** 成都三人局固定使用 48 张标准牌组；“去掉3、4”只适用于两人局。 */
    private reconcileDependencies(): void {
        if (Number(this.values.get('playerCount')) !== 3) return;
        const playRule = this.values.get('playRule');
        if (!Array.isArray(playRule)) return;
        this.values.set('playRule', playRule.filter(value => String(value) !== 'remove_three_four'));
    }
    private control(field: HallRoomRuleField): RuleControl {
        const control = String(field.control ?? '').trim().toLowerCase();
        if (control === 'radio' || control === 'single_select') return 'radio';
        if (control === 'checkbox' || control === 'multi_select') return 'checkbox';
        throw new Error(`未知创建房间控件类型: ${field.control ?? ''}`);
    }
    private isSelected(field: HallRoomRuleField, option: RuleOption): boolean {
        const optionValue = this.optionValue(option);
        const value = this.values.get(field.key); return Array.isArray(value) ? value.some(item => String(item) === String(optionValue)) : String(value) === String(optionValue);
    }
    private hasEnabledOption(field: HallRoomRuleField, value: unknown): boolean {
        return (field.options ?? []).some(option => !this.optionDisabled(option)
            && String(this.optionValue(option)) === String(value));
    }
    private optionValue(option: RuleOption): string | number | boolean {
        return option !== null && typeof option === 'object' ? option.value : option;
    }
    private optionLabel(option: RuleOption): string {
        return option !== null && typeof option === 'object' ? String(option.label ?? option.value) : String(option);
    }
    private optionDisabled(option: RuleOption): boolean {
        return option !== null && typeof option === 'object' && Boolean(option.disabled);
    }
    private fieldLabel(field: HallRoomRuleField): string {
        return String(field.label ?? field.title ?? field.key);
    }
    private estimatedLabelWidth(value: string, fontSize: number): number {
        return [...value].reduce((width, character) => width + (/^[\x00-\xff]$/.test(character) ? fontSize * 0.58 : fontSize), 0);
    }
    private findPath(root: Node, path: string): Node | null { return path.split('/').reduce<Node | null>((node, name) => node?.getChildByName(name) ?? null, root); }
}
