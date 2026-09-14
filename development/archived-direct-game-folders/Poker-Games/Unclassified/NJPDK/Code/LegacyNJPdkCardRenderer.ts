import { Node, resources, Sprite, SpriteFrame, Vec3 } from 'cc';
import { LegacyPrefabRenderer } from '../../../../../../core/runtime/ui/LegacyPrefabRenderer';

export class LegacyNJPdkCardRenderer {
    private readonly prefab = new LegacyPrefabRenderer();
    private readonly frames = new Map<string, SpriteFrame>();

    public async create(card: number, parent: Node, selected: boolean): Promise<Node> {
        const manifest = await this.prefab.loadManifest('legacy-ui/forms/njpdk/game/NJPDK/cardPrefab.manifest');
        const node = await this.prefab.instantiate(manifest, parent);
        this.apply(node, card);
        node.setPosition(new Vec3(node.position.x, selected ? 25 : 0));
        return node;
    }

    public setSelected(node: Node, selected: boolean): void {
        node.setPosition(new Vec3(node.position.x, selected ? 25 : 0));
    }

    private apply(node: Node, rawCard: number): void {
        const card = rawCard > 500 ? rawCard - 500 : rawCard;
        const color = card & 0xf0;
        let value = card & 0x0f;
        if (value === 1) value = 14;
        if (value === 15) value = 2;
        const red = color === 0 || color === 0x20;
        const suit: [string, string] = color === 0
            ? ['bg_diamond1_1', 'bg_diamond1_2']
            : color === 0x10
                ? ['bg_club1_1', 'bg_club1_2']
                : color === 0x20
                    ? ['bg_heart1_1', 'bg_heart1_2']
                    : ['bg_spade1_1', 'bg_spade1_2'];
        const isBigJoker = value === 17;
        this.frame(node, 'icon', color === 0x40 ? `icon_${isBigJoker ? 'big' : 'small'}_king` : suit[0]);
        this.frame(node, 'icon_1', color === 0x40 ? `icon_${isBigJoker ? 'big' : 'small'}_king_01` : suit[1]);
        this.frame(node, 'num', color === 0x40 ? null : `${red ? 'red' : 'black'}_${value}`);
        for (const name of ['black_11', 'black_12', 'black_13', 'red_11', 'red_12', 'red_13', 'big']) {
            const child = node.getChildByName(name); if (child) child.active = false;
        }
        node.getChildByName('poker_back')!.active = false;
    }

    private frame(root: Node, childName: string, assetName: string | null): void {
        const child = root.getChildByName(childName);
        if (!child) return;
        child.active = Boolean(assetName);
        if (!assetName) return;
        const cached = this.frames.get(assetName);
        if (cached) { child.getComponent(Sprite)!.spriteFrame = cached; return; }
        resources.load(`legacy-ui/assets/njpdk/texture/new_poker/${assetName}/spriteFrame`, SpriteFrame, (error, frame) => {
            if (error || !frame || !child.isValid) return;
            this.frames.set(assetName, frame);
            child.getComponent(Sprite)!.spriteFrame = frame;
        });
    }
}
