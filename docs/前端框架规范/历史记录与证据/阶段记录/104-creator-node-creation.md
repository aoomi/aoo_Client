# 104｜Creator 节点创建故障修复

验证时间：2026-08-24  
目标：Client（Cocos Creator 3.8.8）

## 结论

LoginScene 的空节点和常用 UI/渲染节点创建命令已恢复。真实故障由两个独立问题叠加：

1. 资产导入日志中的第一条脚本异常，是已删除兼容转发脚本 `Common/Code/Runtime/CompatibilityApp/bootstrap/LegacyApplicationRuntime.ts` 仍指向不存在的 `Login/Code/Bootstrap/LegacyApplicationRuntime`。当前生产树已删除该失效转发文件，Creator 全量自动导入不再产生 unresolved module。
2. 用户级 Creator 布局注册表 `~/.CocosCreator/editor/layout.json` 被截断成 `{}`。布局初始化访问缺失的 `layoutMap.default`，随后 menu 插件访问缺失的 custom 集合，导致 menu 插件加载失败；节点命令最终在 Window 侧表现为 undefined `push`。已依据 Creator 留存的 3.8.8 布局备份恢复合法的 `version/layoutMap/default` 结构。重启后 menu、hierarchy、scene 与 node-library 均正常注册。

LoginScene 中 4 个 `cc.LabelOutline` 已迁移到各自 `cc.Label` 的 `_enableOutline/_outlineWidth/_outlineColor`，删除旧组件并重排全部原生 `__id__` 引用，视觉参数保持不变。场景不包含 `AooClientManager`，仍由 `ClientBootstrap` 组合 `AuthSession`、`NetworkRuntime` 与 `SceneRouter`。

## 回归门禁

新增 `scripts/verify-creator-node-creation.mjs`，检查 LoginScene 原生对象数组、所有 `__id__` 边界、节点 children/components 数组、悬空/重复组件引用、`LabelOutline` 与 `AooClientManager` 残留。迁移工具 `scripts/migrate-login-scene-outline.mjs` 可幂等执行。

验证结果：

- Creator 3.8.8 全量自动导入：通过；LoginScene 成功导入，无 unresolved module、LabelOutline、undefined push。
- 编辑器菜单：`节点/创建空节点`、`创建渲染节点/Label` 与常用 UI 节点菜单均存在；空节点创建及撤销操作成功。
- TypeScript `--noEmit`：通过。
- Client 自动化测试：80/80 通过。
- 组件注册/UUID 门禁：38 个 ccclass、33,648 个 UUID，通过。
- AooClientManager 生命周期门禁：5/5 通过。
- Creator 节点创建专属门禁：155 个序列化对象、39 个节点，通过。
- Creator web-desktop 构建：通过，22 秒完成。
- 87 完整隔离门禁：25,326 个文件、61,031 条证据、blocking=0、passed=true；单测 7/7 通过。

`Client/profiles/v2/packages/scene.json` 未恢复任何已退役 UUID；最终仍为 44 个 camera 定义与 44 个唯一引用，永久拒绝集合零命中。
