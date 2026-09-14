# CUR-07 Creator 编辑器同步终验

日期：2026-08-25  
环境：Cocos Creator 3.8.8  
结论：**通过（已签署）**

## 边界

- 未修改 `assets/Login/Scenes/LoginScene.scene` 的布局、序列化结构或 `.meta`。
- 未修改活动 owner 文件。
- 仅新增 CUR-07 只读门禁与本报告，并在 `package.json` 注册门禁命令。
- 未写入或伪造 `library` 缓存。

## 新增门禁

命令：`pnpm verify:cur07-editor-sync`

覆盖范围：

- `.scene` / `.prefab` JSON 可反序列化；
- 场景、预制体与 sidecar `.meta` 配对；
- `.meta` / subMeta UUID 存在性与项目内唯一性；
- 完整 UUID 引用解析（项目 UUID 与 Creator 内置 UUID 分流）；
- `resources.load` / `resources.loadDir` 字面量动态路径解析；
- 统计场景、预制体、meta、UUID 与引用规模。

本次结果：10 个 scene、1610 个 prefab、13694 个 meta、33714 个 UUID、145654 个完整 UUID 引用、10 个字面量动态路径。门禁发现 2 个阻塞：

1. `assets/Common/Code/Runtime/CompatibilityApp/a3pk/A3pkSceneBootstrap.ts` 引用的 `native-ui/game/a3pk/resources/game/A3PK/ui/A3PKPlay` 不存在。
2. `assets/Common/Code/Runtime/CompatibilityApp/aydss/AydssSceneBootstrap.ts` 引用的 `native-ui/game/aydss/resources/game/AYDSS/ui/UIAYDSSPlay` 不存在。

另有 2 个非项目 UUID，必须由 Creator 判定是否为引擎/内置资产：

- `eca5d2f2-8ef6-41c2-bbe6-f9c79d09c432`
- `3a7bb79f-32fd-422e-ada2-96f518fed422`

原始结果：`work/cur07-static.log`。

## 其他门禁

| 门禁 | 结果 |
|---|---|
| `pnpm verify:component-registration` | 通过：39 个 ccclass、33708 个 UUID |
| `pnpm verify:creator-native-assets` | 通过：1620 个 scene/prefab、25443 个 asset/meta、blocking=0 |
| component/native 两项 Node 测试 | 通过：2/2 |
| TypeScript | 未执行：项目未安装 `tsc` 可执行文件 |
| `pnpm verify:creator-node-creation` | 失败：旧门禁要求 LoginScene 含测试 Label，与 LoginScene 只读现状不一致 |

日志位于 `work/cur07-*.log`。

## Creator 3.8.8 实际操作证据

1. 已在 Creator 3.8.8 中打开正确项目 `aoo-card-game-frontend-architecture`。
2. 对 `assets/Common/Prefab/MessageLostConnect.prefab` 使用资源管理器“重新导入资源”。
3. 重新导入后关闭该 prefab，Creator 返回此前驻留的 `LoginScene.scene*`。
4. `*` 表示 LoginScene 存在未保存的内存状态。根据根 `AGENTS.md`，该场景布局属于用户且 AI 只读；不能保存旧内存数据，也不能未经授权丢弃用户未保存修改。因此无法安全完成 LoginScene 的关闭重开与恢复数据清理。
5. Creator 状态栏显示 Error=0；控制台当前为 20 条 LabelOutline deprecated 警告。由于无法完成全量重新导入及目标资源关闭重开，本状态不能作为 CUR-07 通过证据。

## 构建决定

未执行 Web Mobile 构建。任务约束要求所有活动预制体修改稳定、Creator 正常重新导入、关闭重开一致且控制台相关错误为 0 后才允许构建；当前静态路径门禁仍有 2 个阻塞，且 LoginScene 未保存状态阻止安全关闭重开，前置条件未满足。

## 待处理

1. 由 LoginScene owner 在 Creator 中决定保存或放弃 `LoginScene.scene*` 的未保存内容，并确认场景回到无星号状态。
2. 由 a3pk/aydss owner 修复或明确移除两条缺失动态资源路径；本任务未越界修改 owner 文件。
3. 在上述修改稳定后，使用 Creator 对所有受影响资源正常重新导入，逐个关闭重开，确认磁盘与 Inspector 一致。
4. 清空控制台后复跑，确认导入、UUID、脚本组件与反序列化相关 Error=0。
5. 最后复跑全部静态门禁和 Creator Web Mobile 构建。

## 2026-08-25 CUR-06 回归移交处理

- 已仅对资源 owner 范围内的 `assets/Club/Prefab/ClubUserList.prefab`、`assets/Lobby/Prefab/UserBeiZhu.prefab` 执行 EditBox label layout normalization；两者原 `.meta` 未改动，UUID 保持。
- `pnpm verify:editbox-label-layout` 已通过：104 个资产、210 个 EditBox，复查 0 changed，测试 3/3 通过。证据：`work/cur07-editbox-after.log`。
- 两个 prefab 的 Creator 重新导入与关闭重开仍待 LoginScene 未保存状态由用户处理后统一执行，因此本项目前仍只能记为磁盘门禁通过，不能记为编辑器同步通过。
- A3PK、AYDSS 目标 prefab 在整个项目中均不存在；当前仅有路径映射/启动器引用。未伪造占位 prefab，也未越界修改启动器 owner 文件，继续等待对应 owner 提供真实资源或修复加载策略。

## 2026-08-25 最终复跑

- owner 已补齐真实 `A3PKPlay.prefab`、`AYDSSPlay.prefab` 及 meta；动态路径门禁清零。
- 已在 Creator 3.8.8 资源管理器中分别对 `A3PKPlay.prefab`、`AYDSSPlay.prefab`、`ClubUserList.prefab`、`UserBeiZhu.prefab` 执行“重新导入资源”，并逐个打开、关闭、重新打开确认 Creator 可正常反序列化；未保存这四个 prefab。
- Creator 状态栏 Error=0、Info=0。现有 23 条 warning 为 LabelOutline deprecated 及一次已由正常导入补齐 meta 后留下的历史消息；磁盘上对应 `CatalogFamilyBindings.ts.meta` 已存在。
- Creator Web 手机端构建成功：`2026-8-25 10:14:05 build success in 1 min 39 s!`。输出：`build/web-mobile-001/`；`profiles/v2/packages/builder.json` 已记录 success。
- 最终门禁全部通过：CUR-07 静态路径/UUID问题 0；组件注册 39 ccclass / 38530 UUID；Creator native assets 1622 scene/prefab、29506 asset/meta、blocking=0；EditBox 104 资产 / 210 EditBox、测试 3/3；Client TypeScript 与全量测试 163/163。
- 证据日志：`work/cur07-static-signed.log`、`work/cur07-components-signed.log`、`work/cur07-native-signed.log`、`work/cur07-editbox-signed.log`、`work/cur07-client-regression.log`。

### 最终签署前的历史阻塞（现已解除）

Creator 主窗口仍为 `LoginScene.scene*`。构建时选择“忽略”未保存数据，明确未保存、未丢弃 LoginScene 内存状态；构建使用磁盘版本。由于 LoginScene 属用户唯一视觉权威，CUR-07 不得替 owner 处理该 `*`，也不能声称已完成 LoginScene 的关闭重开。因此上述资源同步与 Web Mobile 构建均通过，但 CUR-07 总签署仍须等待 LoginScene owner 处理未保存状态后关闭重开一次。

## 2026-08-25 11:00 最终签署

- LoginScene owner 已处理并保存未保存状态；磁盘时间更新为 2026-08-25 10:47:31。本任务未改写其布局。
- 通过 Cocos Dashboard 使用 Creator 3.8.8 正常重新启动项目；主窗口标题为 `LoginScene.scene`，无 `*`，证明未保存恢复状态已清除，且 LoginScene 已从磁盘关闭重开。
- 对 `LoginScene.scene` 在 Creator 资源管理器执行“重新导入资源”；重新导入后标题仍无 `*`。
- Creator 状态栏：Error=0、Info=0、Warning=3、Log=0；3 条均为非阻塞引擎提示（LabelOutline deprecated / physics2d builtin 切换），无导入、UUID、脚本组件或反序列化错误。
- 清除未保存状态后再次由 Creator 执行 Web Mobile 构建：`2026-8-25 11:00:19 build success in 25 s!`，输出仍为 `build/web-mobile-001/`。
- 最终复跑全部为 0：CUR-07 静态门禁、component registration、Creator native assets、EditBox layout、Client TypeScript 与 163 项测试。
- 最终证据：`work/cur07-static-final-signed.log`、`work/cur07-components-final-signed.log`、`work/cur07-native-final-signed.log`、`work/cur07-editbox-final-signed.log`、`work/cur07-client-regression-final.log`、`profiles/v2/packages/builder.json`、`build/web-mobile-001/`。

CUR-07 全部完成条件均已满足，正式签署通过。
