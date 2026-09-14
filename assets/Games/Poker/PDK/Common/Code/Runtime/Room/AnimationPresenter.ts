import { Node } from 'cc';
import { PdkAnimationResolver } from '../PdkAnimationResolver';
import { pdkAnimationForOpCardType } from '../PdkAnimationRegistry';

export class AnimationPresenter {
    private readonly resolver: PdkAnimationResolver;
    public constructor(find: (path: string) => Node | null) { this.resolver = new PdkAnimationResolver(find); }
    public playOperation(opType: number, physicalSlot: number): Promise<void> {
        const key = pdkAnimationForOpCardType(opType);
        return key ? this.resolver.play(key, physicalSlot) : Promise.resolve();
    }
    public play(folderKey: string, physicalSlot = 0): Promise<void> { return this.resolver.play(folderKey, physicalSlot); }
    public clear(): void { this.resolver.clear(); }
    public destroy(): void { this.resolver.destroy(); }
}
