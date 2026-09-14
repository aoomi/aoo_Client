import { Button, Label, Node } from 'cc';
import { legacyPlatformBridge } from '../../../Common/Code/Runtime/platform/LegacyPlatformBridge';
import type { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';

const boundForms = new WeakSet<Node>();

/** Binds the authored QQ/WeChat fields, not only their label glyphs. */
export function bindSupportNumberCopy(form: LegacyForm, forms: LegacyFormManager): void {
    if (boundForms.has(form.node)) return;
    boundForms.add(form.node);
    for (const path of ['Copy/QQ', 'Copy/WeChat']) {
        const field = form.find(path);
        const value = field?.getChildByName('Label')?.getComponent(Label)?.string.trim() ?? '';
        if (!field?.getComponent(Button) || !value) continue;
        field.on(Button.EventType.CLICK, () => {
            void legacyPlatformBridge.writeClipboard(value).then((copied) => {
                void forms.show('UIMessage_Drift', null, null, copied ? '复制成功' : '复制失败，请手动复制');
            }, () => {
                void forms.show('UIMessage_Drift', null, null, '复制失败，请手动复制');
            });
        });
    }
}
