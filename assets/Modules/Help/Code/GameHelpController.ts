import { Color, instantiate, Label, Node, UITransform } from 'cc';
import type { LegacyForm } from '../../../Common/Code/Runtime/ui/LegacyFormManager';

const PDK_HELP: ReadonlyArray<readonly [string, string]> = [
    ['游戏介绍', '跑得快使用一副牌，目标是最先打完手牌。房间实际人数、手牌数量和特殊规则以创建房间时的选项为准。'],
    ['基础牌型', '支持单张、对子、三张、三带牌、顺子、连对、飞机、四带牌和炸弹；2不能进入顺子。'],
    ['比较规则', '炸弹大于普通牌型；普通牌必须牌型及张数一致才能比较，主体点数更大的牌获胜。'],
    ['出牌规则', '轮到自己时按当前房间规则出牌；启用必须压牌时，有合法的大牌必须跟牌。下家报单时按房间规则处理最大单张。'],
    ['计分说明', '输赢、炸弹、关门、红桃十等计分以创建房间的权威规则为准，房间底分由最终结算统一计算。'],
];

/** Renders current PDK help data into the migrated 2.2.2 help shell. */
export class GameHelpController {
    public show(form: LegacyForm): void {
        const template = form.find('btnPrefab');
        const list = form.find('UIInfo/layout_node/mark/layout');
        const content = form.find('UIInfo/sp_info/sv_info01/view/content');
        if (!template || !list || !content) return;

        list.removeAllChildren();
        const button = instantiate(template);
        button.name = 'btn_pdk';
        button.active = true;
        this.setLabel(button, 'icon_off', '跑得快');
        this.setLabel(button, 'icon/icon_on', '跑得快');
        button.getChildByName('icon')!.active = true;
        list.addChild(button);

        content.removeAllChildren();
        let y = 0;
        for (const [title, description] of PDK_HELP) {
            y -= this.addText(content, `【${title}】`, y, 26, new Color(181, 104, 48, 255), 52);
            y -= this.addText(content, description, y, 22, new Color(92, 129, 61, 255), 104);
        }
        content.getComponent(UITransform)?.setContentSize(780, Math.max(620, -y + 30));
        form.node.emit('game-help-rendered', 'CD201');
    }

    private addText(parent: Node, text: string, y: number, fontSize: number, color: Color, height: number): number {
        const node = new Node(`Help_${parent.children.length}`);
        node.setPosition(-390, y);
        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0, 1);
        transform.setContentSize(780, height);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 10;
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
        label.verticalAlign = Label.VerticalAlign.TOP;
        label.overflow = Label.Overflow.RESIZE_HEIGHT;
        label.enableWrapText = true;
        parent.addChild(node);
        return height;
    }

    private setLabel(root: Node, path: string, value: string): void {
        const label = root.getChildByPath(path)?.getComponent(Label);
        if (label) label.string = value;
    }
}
