# 109 EditBox 标签布局验证

## 2026-08-25 真实编辑器复验与修正

此前结论未覆盖 `LoginScene` 被后续变更覆盖后的最终序列化状态：两个 EditBox
没有绑定 `EditBoxLabelLayout`，四个标签仍为锚点 `(0.5, 0.5)`、坐标
`(-55, 0)`，因此 Creator 重新反序列化后会漂出输入框。本次已只修正
`EditBoxAccount`、`EditBoxPsw` 内部 `TEXT_LABEL`/`PLACEHOLDER_LABEL` 并重新绑定
公共组件，未调整输入框本体及登录界面其他节点。

门禁新增最终场景边界检查：分别计算四个标签反序列化后的左右上下边界，任何标签
中心或尺寸落到输入框外都会失败。规范化工具新增 `--file` 参数，可只处理指定资源，
避免修复登录页时覆盖其他任务正在修改的场景。

已在 Cocos Creator 3.8.8 中先打开 `Boot_Strap.scene`，再从资源管理器重新搜索并打开
`LoginScene.scene`，确认编辑器真实刷新后账号与密码标签位于各自输入框内部并垂直
居中。证据截图：`docs/前端框架规范/历史记录与证据/验收记录/109-editbox-creator-refresh.png`。

## 结论

全项目 104 个场景/预制体中的 210 个 `cc.EditBox` 已统一绑定
`EditBoxLabelLayout`。正文与占位标签使用左上角布局基准锚点 `(0, 1)`、2 px
左内边距、完整可用高度、`CLAMP` overflow、垂直居中以及标准 alpha 混合
`ONE / ONE_MINUS_SRC_ALPHA`。水平对齐保留各输入框已有语义，正文与提示可分别配置。

LoginScene 只改动 `EditBoxAccount`、`EditBoxPsw` 内部的 `TEXT_LABEL`、
`PLACEHOLDER_LABEL` 序列化布局/渲染属性并绑定公共组件；没有改动节点名称、层级、
输入框位置尺寸、图片或其他界面节点。

## Creator 3.8.8 根因

Creator 3.8.8 的 `cc.EditBox.__preload()` 调用 `_init()`。反序列化完成后，
`_init()` 会重新处理正文/提示标签、监听 EditBox 节点的 `SIZE_CHANGED`，并在
`_syncSize()` 中调用 `_updateLabelPosition(size)`。该方法固定将标签放在输入框的
左上角基准位置：

- 标签尺寸为 `width - 2`、`height`；
- 标签局部坐标为 `(-anchorX * width + 2, -anchorY * height + height)`；
- 这个坐标表达的是标签的左上角，因此标签锚点必须为 `(0, 1)`。

此前 LoginScene 标签锚点为 `(0.5, 0.5)`，但位置仍是上述左上角基准坐标
`(-166.5, 37.5)`。编辑器刷新时引擎再次同步位置，视觉上便漂回左上角。提示标签
还使用 `NONE` overflow，排版后会按内容回写尺寸，使手工尺寸同样不稳定。

依据：Cocos Engine v3.8.8 官方源码
[`edit-box.ts`](https://github.com/cocos/cocos-engine/blob/v3.8.8/cocos/ui/editbox/edit-box.ts#L531-L542)
的初始化/尺寸同步，以及
[`_updateLabelPosition`](https://github.com/cocos/cocos-engine/blob/v3.8.8/cocos/ui/editbox/edit-box.ts#L705-L723)
的坐标与尺寸公式。

## 方案

`assets/Common/Code/UI/EditBoxLabelLayout.ts` 只使用公开组件 API：

- `onLoad`/`onEnable` 做初始同步；
- 监听宿主节点 `Node.EventType.SIZE_CHANGED`，且执行顺序 120 晚于 EditBox 的 110；
- 同步标签锚点、局部坐标、可用尺寸、水平/垂直对齐；
- 无每帧 `update`、定时器、引擎私有方法、prototype 修改或 2.22 依赖。

序列化规范化脚本会修复标签引用缺失但子节点已存在的 11 个 EditBox，并为所有
EditBox 绑定公共组件。静态门禁对标签绑定、锚点、坐标、尺寸、对齐、overflow、
混合因子和公共组件配置逐项检查。

## 验证命令

```bash
pnpm run verify:editbox-label-layout
```

底层命令：

```bash
node scripts/normalize-editbox-label-layout.mjs
node --test tests/ui/EditBoxLabelLayout.test.mjs
```

验证覆盖 210 个 EditBox、420 个标签；静态门禁重复运行应报告 0 changed。运行测试
验证非对称内边距公式，并防止以后引入轮询、延时覆盖或 engine monkey-patch。

Creator 3.8.8 命令行已完成项目刷新、脚本编译并成功注册
`EditBoxLabelLayout`。随后 Web Mobile 全量构建在“查询 Asset Bundle”阶段被项目既有
缓存缺口阻断：缺少
`library/fe/fe605605-436a-4d73-969f-8c7ab646e52e.json`，对应
`assets/Lobby/Prefab/uiGame/cdp/RecordAllResult_cdp.prefab`。该资源不属于
109/EditBox 独占边界，因此本任务未修改它。失败发生在 bundle 查询阶段，早于平台
产物生成，日志中没有 EditBox 组件编译或反序列化错误。

## Web 构建复核（2026-08-25）

- Creator 3.8.8 Web Mobile 构建后，账号和密码输入框保持原灰色背景，不出现空 SpriteFrame 白底。
- 账号输入框获得焦点后光标位于灰色输入框内部；密码提示文字位于输入框内部并保持可读。
- 账号弹窗由“账号登录”入口正常打开，初始登录页不再错误地自动显示弹窗。
- 证据：[109-editbox-web-account-dialog.png](./109-editbox-web-account-dialog.png)
