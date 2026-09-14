import { Button, EditBox, isValid, Node, Toggle } from 'cc';
import type { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { SupportCaseClient } from './SupportCaseClient';

/** Owns the migrated feedback prefab and submits through the authenticated support API. */
export class FeedbackController {
    private readonly disposers: Array<() => void> = [];
    private busy = false;

    public constructor(
        private readonly forms: LegacyFormManager,
        private readonly cases: SupportCaseClient,
        private readonly reportError: (error: unknown) => void,
    ) {}

    public async open(): Promise<void> {
        const form = await this.forms.show('UILobbyFeedback');
        if (!form) return;
        this.clearBindings();
        this.bind(form, 'btn_close', () => this.forms.closeAfterPointer('UILobbyFeedback'));
        this.bind(form, 'btn_tijiao', () => { void this.submit(form); });
    }

    public destroy(): void {
        this.clearBindings();
    }

    private async submit(form: LegacyForm): Promise<void> {
        if (this.busy) return;
        const description = this.edit(form, 'EditBoxContent');
        if (!description) {
            await this.forms.show('UIMessage_Drift', null, null, '请填写意见或建议');
            return;
        }
        const phone = this.edit(form, 'EditBoxPhone');
        const category = this.category(form);
        this.busy = true;
        try {
            await this.cases.create('TICKET', `意见反馈：${category}`,
                phone ? `${description}\n联系电话：${phone}` : description);
            await this.forms.show('UIMessage_Drift', null, null, '提交成功，感谢您的意见建议');
            this.forms.close('UILobbyFeedback');
        } catch (error: unknown) {
            this.reportError(error);
        } finally {
            this.busy = false;
        }
    }

    private category(form: LegacyForm): string {
        const categories = [['toggle1', '建议'], ['toggle2', '问题'], ['toggle3', '其他']] as const;
        return categories.find(([name]) => this.find(form.node, name)?.getComponent(Toggle)?.isChecked)?.[1] ?? '其他';
    }

    private edit(form: LegacyForm, name: string): string {
        return this.find(form.node, name)?.getComponent(EditBox)?.string.trim() ?? '';
    }

    private bind(form: LegacyForm, name: string, listener: () => void): void {
        const node = this.find(form.node, name);
        if (!node) return;
        node.on(Button.EventType.CLICK, listener);
        this.disposers.push(() => {
            if (isValid(node, true)) node.off(Button.EventType.CLICK, listener);
        });
    }

    private find(root: Node, name: string): Node | null {
        if (root.name === name) return root;
        for (const child of root.children) {
            const found = this.find(child, name);
            if (found) return found;
        }
        return null;
    }

    private clearBindings(): void {
        for (const dispose of this.disposers.splice(0)) dispose();
    }
}
