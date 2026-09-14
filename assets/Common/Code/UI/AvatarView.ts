import { _decorator, Component, Sprite, SpriteFrame } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('AooAvatarView')
export class AvatarView extends Component {
    @property(Sprite) public image: Sprite | null = null;
    public show(frame: SpriteFrame | null): void { if (this.image) this.image.spriteFrame = frame; }
    public clear(): void { this.show(null); }
}
