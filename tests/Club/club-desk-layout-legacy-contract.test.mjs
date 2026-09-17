import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const controllerPath = new URL('../../assets/Club/Code/Runtime/LegacyClubMainController.ts', import.meta.url);

test('模板桌沿用 2.2.2 显式占位排布与标题优先级', () => {
    const source = fs.readFileSync(controllerPath, 'utf8');

    assert.match(source, /roomLayout\.enabled = false/,
        '迁移桌必须禁用会导致节点重叠的 Creator 3.8 自动 Layout');
    assert.match(source, /contentTransform\.setContentSize\(contentWidth/,
        '内容宽度必须随全部模板桌扩展');
    assert.match(source, /node\.setScale\(0\.7, 0\.7, 1\)/,
        '迁移后的 620x360 桌子必须沿用旧大厅占位缩放');
    assert.match(source, /const deskWidget = node\.getComponent\(Widget\)/,
        '模板桌根节点 Widget 必须由大厅接管，不能持续把所有实例拉回中心');
    assert.match(source, /if \(deskWidget\) deskWidget\.enabled = false/,
        '实例化模板桌后必须关闭根节点定位 Widget');
    assert.match(source, /const column = Math\.floor\(index \/ 2\)/,
        '模板桌必须按旧版每列两桌计算列号');
    assert.match(source, /this\.activeClubDeskWidth\(node\)/,
        '横向占位必须读取当前启用 Players_ 节点的真实宽度');
    assert.match(source, /players\?\.getComponent\(UITransform\)\?\.contentSize\.width/,
        'Creator 3.8 必须通过 UITransform.contentSize 读取 Players_ 宽度');
    assert.match(source, /authoredWidth \* Math\.abs\(root\.scale\.x\)/,
        'Players_ 设计宽度必须换算为大厅中的实际缩放宽度');
    assert.match(source, /node\.setPosition\(columnCenters\[column\]/,
        '每张模板桌必须按实际列宽获得两行横向分页坐标');
    assert.match(source, /markTransform\.setContentSize\(roomListTransform\.contentSize\.width/,
        '滚动视口必须收敛到 RoomList 可见宽度，不能把屏幕外区域算作可见区');
    assert.doesNotMatch(source, /roomLayout\.constraint = Layout\.Constraint\.FIXED_ROW/,
        '不得强制两行，否则第二行会落到大厅底栏后面');
    assert.match(source, /if \(roomName\) return roomName/,
        '模板有房间名时必须优先显示房间名');
    assert.match(source, /CATALOG_GAME_METADATA\[gameCode\]\?\.displayName/,
        '无房间名时必须显示 Catalog 中文名，不能直接显示 LS201 等业务编码');
    assert.match(source, /void this\.restoreAuthoritativeTemplates\(this\.clubId\(\), '进入俱乐部后的模板恢复'\)/,
        '每次进入大厅都必须像 2.2.2 InitNullTable 一样恢复全部启用模板');
});
