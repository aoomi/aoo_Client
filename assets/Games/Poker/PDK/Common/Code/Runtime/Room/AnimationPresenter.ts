import { Node } from 'cc';
import { PdkAnimationResolver, type PdkAnimationPlaybackContext } from '../PdkAnimationResolver';
import { pdkAnimationForOpCardType } from '../PdkAnimationRegistry';

export class AnimationPresenter {
    private readonly resolver: PdkAnimationResolver;
    public constructor(find: (path: string) => Node | null) { this.resolver = new PdkAnimationResolver(find); }
    public playOperation(
        opType: number,
        physicalSlot: number,
        context: PdkAnimationPlaybackContext = {},
    ): Promise<void> {
        const key = pdkAnimationForOpCardType(opType);
        return key ? this.resolver.play(key, physicalSlot, { ...context, opType }) : Promise.resolve();
    }
    public play(
        folderKey: string,
        physicalSlot = 0,
        context: PdkAnimationPlaybackContext = {},
    ): Promise<void> { return this.resolver.play(folderKey, physicalSlot, context); }
    public clear(): void { this.resolver.clear(); }
    public destroy(): void { this.resolver.destroy(); }
}
