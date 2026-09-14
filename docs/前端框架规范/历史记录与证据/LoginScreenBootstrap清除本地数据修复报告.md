# LoginScreenBootstrap 清除本地数据修复报告

## 根因

1. 应用实际先运行 `Boot_Strap.scene`。该场景中的 `LoginScreenBootstrap.isClearLocalData` 为 `false`，而用户勾选的是后续 `Login_Scene.scene` 中的同名字段。账号会话恢复、refresh token 刷新和房间恢复均已在加载登录场景前发生。
2. 清理策略把 `aoo.loading.clear-local-data.consumed.v1` 写入 `localStorage`。该标记跨 Preview 生命周期持久存在，导致之后即使 Inspector 仍勾选，清理也被直接跳过。
3. `startClientServices()` 使用全局单例。若同一 JavaScript 运行期已经创建服务，仅删除浏览器存储不足以清除 `AuthSession.currentAccount`、进行中的恢复请求、网络连接和场景恢复对象。

## 修复

- 将启动场景 `Boot_Strap.scene` 的“是否清除本地数据”默认设为未勾选。只有该启动场景 Inspector 显式勾选时，才会在 `bootstrapRuntime.initialize()`、`startClientServices()`、`recoverBootstrapTarget()` 之前清理。
- 清理裁决只允许启动场景执行；后续登录场景不再重新解释同名字段。
- 删除跨 Preview 的“清理已消费”持久标记。单次 JavaScript 运行期仍由 `AooLoadingBootState.cleanupPromise` 保证只清一次。
- 清理成功或部分失败时都阻止旧身份自动恢复；已有服务单例会执行 `AuthSession.blockAutomaticRestore()` 和 `SceneRouter.resetSession()`，取消恢复、清空当前账号、关闭旧网络与房间运行态并回到未登录状态。
- 未勾选严格走无副作用分支：测试环境、Preview、网关版本检查、`cleanupNow` 默认值及同一运行期此前的清理记录都不能触发删除或阻断自动恢复。
- `aoo.deviceId` 明确保留，它属于平台设备身份，不属于账号或认证恢复数据。

## 清理范围

认证及账号恢复的关键键包括：

- `aoo.auth.session.v2`：access token、refresh token、账号 ID、访客凭据和资料快照。
- `aoo.auth.last-account`：登录页账号回填。
- `aoo.room.recovery.v1.*`：房间恢复意图。
- `Account`：旧版账号数据。
- `aoo.*`、`aoo:*` 以及已登记的 Aoo 业务键；但保留 `aoo.deviceId`。
- Aoo 的 `sessionStorage`、已知或枚举到的 Aoo IndexedDB、Aoo 可变 CacheStorage。

旧的 `aoo.loading.clear-local-data.consumed.v1` 也会被前缀清理删除，且不会再次写入。

## 两个配置分支

- 勾选：仅 `Boot_Strap.scene` 的 Inspector 显式勾选时，启动最前阶段清理本机 Aoo 认证、账号提示和房间恢复数据；阻止 token 自动刷新与旧账号恢复；当前运行期重置为未登录态；最终显示登录页，账号框不回填旧账号。
- 未勾选：不执行任何删除、不阻止自动恢复；无论是否测试环境、开发 Preview 或启动版本检查，均保留当前账号、access/refresh token、必要 session 与有效页面/房间恢复上下文，并按权威状态恢复。

## 修改文件

- `Client/assets/Login/Code/Bootstrap/LoadingEnvironmentPolicy.ts`
- `Client/assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts`
- `Client/assets/Login/Scenes/Boot_Strap.scene`
- `Client/docs/LoginScreenBootstrap清除本地数据修复报告.md`

## 验证状态

遵照任务要求，未运行全量测试或构建。已完成静态调用顺序与存储键核对。场景文件已落盘，但当前会话没有可用的 Creator UI 控制通道，因此 Creator 3.8.8 资源数据库刷新、重新打开场景和 Inspector 复核标记为待编辑器同步，不能作为已完成的编辑器验证。
