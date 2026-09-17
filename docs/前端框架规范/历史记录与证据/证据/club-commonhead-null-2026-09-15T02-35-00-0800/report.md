# 亲友圈 `getComponent` 空对象异常修复证据

- 时间：2026-09-15（Asia/Shanghai）
- 客户端：Cocos Creator 3.8.8 Preview `http://127.0.0.1:7456`
- 测试浏览器：任务专属无头 Chrome，CDP `127.0.0.1:1237`
- 测试账号：`31`（密码按项目测试约定使用，本证据不记录密码）

## 首个完整异常栈

```text
TypeError: Cannot read properties of null (reading 'getComponent')
    at ScrollBar._setOpacity (index.js:85070:40)
    at ScrollBar.hide (index.js:84929:16)
    at ScrollView._updateScrollBarState (index.js:86460:35)
    at ScrollView._moveContentToTopLeft (index.js:86815:16)
    at ScrollView._calculateBoundary (index.js:86181:18)
    at ScrollView.onEnable (index.js:85990:18)
    at OneOffInvoker.invokeOnEnable (index.js:51836:18)
    at OneOffInvoker.invoke (index.js:51741:18)
    at NodeActivator.activateNode (index.js:52876:29)
    at Node._onHierarchyChangedBase (index.js:55434:46)
```

Creator 3.8.8 引擎在 `ScrollBar._setOpacity` 中执行 `this.node.getComponent(Sprite)`；当时 `_handle` 存在，但 `this.node` 为 `null`。

## 根因和修复

`ClubMain/Middle/RoomList/mark` 的 `cc.ScrollView`（序列化对象 `1336`）仍引用旧水平 `cc.ScrollBar`（对象 `1338`），但该滚动条及其 `cc.Sprite`（对象 `1340`）都已从节点脱离，`node` 为 `null`。页面激活 `ScrollView` 时引擎自动执行滚动条状态更新，因此在任何 CommonHead/ClubDesk 席位渲染之前就崩溃。

修复只将该 `ScrollView._horizontalScrollBar` 改为 `null`。房间列表已由 `UnifiedScroll` 接管，不需要可视水平滚动条。未修改节点名、层级、布局、UUID、meta、CommonHead 或 ClubDesk 逻辑。

## Creator 同步

- 在 Creator 3.8.8 资源面板打开 `ClubMain.prefab`，触发正常资源导入。
- Library 缓存 `library/e3/e3246265-c2ae-423b-8900-1e5214848bc4.json` 于 `2026-09-15 02:45:15` 更新，权威 `ScrollView` 中 `_horizontalScrollBar` 为 `null`。
- 关闭并重新打开 `ClubMain.prefab`后层级正常；随后恢复用户原先打开的 `PDK_CommonRoom.prefab`。
- Creator 未新增导入、脚本注册、缺失 UUID 或反序列化错误。控制台仅有任务前已存在的 `Common/Atlas/bg1.jpg/png` 动态 URL 重复警告。

## 验收结果

- `club-template-unified-scroll.test.mjs`：`6/6` 通过，新增门禁确认 RoomList 不再绑定脱离节点的旧 ScrollBar。
- 真实 Canvas 首次进入：大厅→亲友圈列表→亲友圈主页，`ClubMain` 激活，模板桌和玩家头像正常实例化，`pageerror=[]`。
- 真实 Canvas 销毁重进：点击返回至大厅，再次进入同一亲友圈，`ClubMain` 再次激活，48 个模板桌节点、32 个 CommonHead 变体节点存在，`pageerror=[]`。
- 两次进入均未再出现 `Cannot read properties of null (reading 'getComponent')`，也未出现先前级联的 `passes`/`length` 渲染异常。
- 仅观察到头像 URL `http://127.0.0.1:8765/tx580.png` 无对应本地服务的既存网络拒绝，与本次崩溃无关，未扩大修改范围。

## 截图

- `04-club-main-repro.png`：修复前首次复现。
- `05-clean-repro.png`：修复前重载后稳定复现。
- `07-fixed-club-main.png`：修复后首次进入。
- `08-fixed-club-main-reentry.png`：修复后返回并再次进入。

## 非本任务项

附近的 `club-desk-runtime-selection.test.mjs` 仍期待旧字面格式 `bundleName/assetPath`，而当前业务代码使用 `{ bundle, path }`，因此该既存契约测试失败。本次未修改该业务代码或测试，也未将旁支问题纳入修复。
