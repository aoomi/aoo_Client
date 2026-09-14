import { instantiate, Node, Prefab, SpriteAtlas, SpriteFrame } from 'cc';
import { AssetLoader } from '../../../../../Common/Code/UI/Infrastructure';
import { Poker_Card_Face, Poker_Card_Presenter, Poker_Card_Skin, Poker_Card_Suit } from './Poker_Card_Presenter';

const POKER_CARD_BUNDLE = 'poker-common';
const POKER_CARD_ATLAS_BUNDLE = 'common';
const POKER_CARD_ASSET = 'Prefab/Poker_Card';
const POKER_COMMON_ATLAS = 'Atlas/Poker_Common';

interface DecodedPokerCard {
    rank: number;
    suit: Poker_Card_Suit;
}

/** 唯一公共扑克牌实例入口；协议牌值只在这里转换为模板契约。 */
export class Poker_Card_Factory {
    private readonly assets = new AssetLoader();
    private prefab: Prefab | null = null;
    private skin: Poker_Card_Skin | null = null;

    public async create(
        parent: Node,
        rawCard: number,
        face: Poker_Card_Face = Poker_Card_Face.Front,
        selected = false,
        disabled = false,
    ): Promise<Node> {
        const card = instantiate(await this.loadPrefab());
        const presenter = card.getComponent(Poker_Card_Presenter);
        if (!presenter) {
            card.destroy();
            throw new Error('Poker_Card prefab is missing Poker_Card_Presenter');
        }
        const decoded = this.decode(rawCard);
        presenter.present(decoded.rank, decoded.suit, face, selected, disabled, await this.loadSkin());
        card.name = `Poker_Card_${rawCard}`;
        parent.addChild(card);
        return card;
    }

    public setSelected(card: Node, selected: boolean): void {
        const presenter = card.getComponent(Poker_Card_Presenter);
        if (!presenter) throw new Error('Poker_Card instance is missing Poker_Card_Presenter');
        presenter.setSelected(selected);
    }

    public clear(parent: Node | null): void {
        parent?.removeAllChildren();
    }

    private async loadPrefab(): Promise<Prefab> {
        if (this.prefab) return this.prefab;
        const bundle = await this.assets.bundle(POKER_CARD_BUNDLE);
        this.prefab = await this.assets.load(POKER_CARD_ASSET, Prefab, bundle);
        return this.prefab;
    }

    private async loadSkin(): Promise<Poker_Card_Skin> {
        if (this.skin) return this.skin;
        // Poker_Card 属于 poker-common；其现存图集位于 Common 的唯一公共 Bundle，
        // 因此必须按真实归属加载，不能恢复已删除的独立卡牌 Bundle。
        const bundle = await this.assets.bundle(POKER_CARD_ATLAS_BUNDLE);
        const atlas = await this.assets.load(POKER_COMMON_ATLAS, SpriteAtlas, bundle);
        this.skin = {
            cardFront: this.requireAtlasFrame(atlas, 'card_front'),
            cardBack: this.requireAtlasFrame(atlas, 'card_back_0'),
            selectedMask: this.requireAtlasFrame(atlas, 'card_mask'),
            disabledMask: this.requireAtlasFrame(atlas, 'card_front_out'),
        };
        return this.skin;
    }

    private requireAtlasFrame(atlas: SpriteAtlas, name: string): SpriteFrame {
        const frame = atlas.getSpriteFrame(name);
        if (!frame) throw new Error(`Poker_Card skin frame is missing: ${name}`);
        return frame;
    }

    private decode(rawCard: number): DecodedPokerCard {
        if (!Number.isInteger(rawCard)) throw new Error(`invalid poker card value: ${rawCard}`);
        const protocolSuit = Math.floor(rawCard / 100);
        const protocolRank = rawCard % 100;
        if (protocolSuit === 5 && (protocolRank === 16 || protocolRank === 17)) {
            return { rank: protocolRank - 1, suit: Poker_Card_Suit.Spade };
        }
        if (protocolSuit < 1 || protocolSuit > 4 || protocolRank < 3 || protocolRank > 15) {
            throw new Error(`unsupported poker card value: ${rawCard}`);
        }
        // 服务端 PokerCardCodec 的花色顺序继承旧协议：方块、梅花、红桃、黑桃。
        // 转换只允许集中在工厂内，避免各玩法把权威牌值解释成不同的图片。
        const suits = [
            Poker_Card_Suit.Diamond,
            Poker_Card_Suit.Club,
            Poker_Card_Suit.Heart,
            Poker_Card_Suit.Spade,
        ] as const;
        return { rank: protocolRank === 15 ? 2 : protocolRank, suit: suits[protocolSuit - 1] };
    }
}
