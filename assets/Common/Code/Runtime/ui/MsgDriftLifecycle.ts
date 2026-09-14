import { Label, Node, RichText, Tween, UIOpacity, Vec3, instantiate, tween } from 'cc';
import type { LegacyForm, LegacyFormLifecycle } from './LegacyFormManager';

const TOP_HOLD_SECONDS = 0.5;
const SLIDE_SECONDS = 2;
const FADE_SECONDS = 0.15;
const SLIDE_DISTANCE = 90;

/**
 * Shared lifecycle for the authoritative Common/Prefab/MsgDrift prefab.
 *
 * The prefab owns appearance and centered origin. Runtime code only restores that
 * authored state for each invocation, then performs the common upward drift.
 */
export function createMsgDriftLifecycle(close: () => void): LegacyFormLifecycle {
    let authoredPosition: Vec3 | null = null;
    const activeVisuals = new Set<Node>();

    const stop = (visual: Node): void => {
        if (!visual.isValid) return;
        Tween.stopAllByTarget(visual);
        const opacity = visual.getComponent(UIOpacity);
        if (opacity) Tween.stopAllByTarget(opacity);
    };

    const play = (form: LegacyForm, content: string): void => {
        const template = form.node;
        const parent = template.parent;
        if (!template.isValid || !parent?.isValid) return;
        authoredPosition ??= template.position.clone();
        // The registered form remains an invisible template. Every trigger gets
        // its own visual node, so rapid clicks display immediately and never
        // restart, overwrite or wait for another message's animation.
        template.active = false;
        const visual = instantiate(template);
        visual.setPosition(authoredPosition);
        visual.active = true;
        parent.addChild(visual);
        activeVisuals.add(visual);
        const messageNode = visual.getChildByName('LabelMessage');
        const message = messageNode?.getComponent(Label) ?? messageNode?.getComponent(RichText);
        if (!message) throw new Error('MsgDrift/LabelMessage contract is missing');

        const opacity = visual.getComponent(UIOpacity) ?? visual.addComponent(UIOpacity);
        opacity.opacity = 255;
        message.string = content;

        tween(visual)
            .by(SLIDE_SECONDS, { position: new Vec3(0, SLIDE_DISTANCE, 0) })
            .start();
        tween(opacity)
            .delay(SLIDE_SECONDS + TOP_HOLD_SECONDS)
            .to(FADE_SECONDS, { opacity: 0 })
            .call(() => {
                if (!activeVisuals.delete(visual)) return;
                stop(visual);
                if (visual.isValid) visual.destroy();
                if (activeVisuals.size === 0 && form.node.isValid) close();
            })
            .start();
    };

    const clear = (form: LegacyForm): void => {
        for (const visual of activeVisuals) {
            stop(visual);
            if (visual.isValid) visual.destroy();
        }
        activeVisuals.clear();
        form.node.active = false;
    };

    return {
        onShow: (form, _msgId, _args, content) => {
            play(form, String(content ?? ''));
        },
        onClose: clear,
        onDestroy: clear,
    };
}
