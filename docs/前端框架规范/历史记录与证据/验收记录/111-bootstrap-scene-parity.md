# 111 启动场景等价迁移验证

## 来源与边界

- 唯一旧版启动场景：`QH_DFMJ/client/assets/resources/scene/launchScene.fire`，构建启动 UUID 为 `4504856b-e651-441d-afb5-cf973511e420`。
- 新版场景：`assets/Login/Scenes/Boot_Strap.scene`，保留现有 3.8.8 UUID `8d2a710a-63f6-4186-a17f-81339a64ef2c`。
- 背景、Logo、进度轨道、进度填充、错误面板和重试按钮取自旧版真实资源，但由 Creator 3.8.8 生成新的资源元数据，不引用旧场景、旧脚本或旧 UUID。
- 启动场景仅承载版本检查、服务器目录、状态、错误重试和进入登录页，不预载大厅、亲友圈或子游戏资源。

## 原生结构

场景使用原生 `Canvas`、`Camera`、`Sprite`、`Label`、`ProgressBar`、`Button`、`Widget` 和现有 `LoginScreenBootstrap` 组件，设计分辨率为 1280x720。包含真实进度、版本文字、健康提示、失败面板和重试按钮。

## 编辑器同步与验证

- Creator 3.8.8 正常重新导入全部启动图片并生成 SpriteFrame。
- 关闭并重新打开 Boot_Strap、Login_Scene 后核对编辑器显示与磁盘内容一致。
- 验证命令：`node --test tests/ui/BootstrapScene.test.mjs tests/ui/EditBoxLabelLayout.test.mjs`。
- Web Mobile 构建、预览、控制台与最终截图结果记录在本任务完成报告中。
- `RecordAllResult_cdp.prefab` 通过 Creator 正常资源导入恢复 Library 缓存，未手工创建缓存文件。

## 2026-08-25 最终闭环

- Web Mobile 从 `Boot_Strap.scene` 启动，真实调用版本检查与服务器目录接口后进入 `Login_Scene.scene`。
- 登录场景依赖的 `common-prefab` 在切场景前通过 Creator `assetManager.loadBundle` 加载；登录场景使用 `director.preloadScene` 的真实完成数量更新进度，不做假进度。
- 启动失败、公共 Bundle 失败、登录场景预加载失败均显示中文、可恢复的明确原因。
- Web Mobile 自定义模板已删除废弃的 `minimal-ui` viewport 参数。
- Creator 3.8.8 Web Mobile 构建任务完成，未出现资源 UUID、反序列化或 `RecordAllResult_cdp.prefab` 导入缓存错误。CLI 结束时仍返回 Creator 自身的 36/SIGTERM 清理码，但构建日志明确输出 `build Task (web-mobile) Finished`，产物完整可运行。
- Safari 无痕窗口实测：启动资源 -> 版本/服务器检查 -> `common-prefab` -> LoginScene；登录页游客登录、账号登录两个入口均显示，账号按钮可打开原生账号弹窗。
- 证据：[111-bootstrap-web-login.png](./111-bootstrap-web-login.png)

## 2026-08-25 现场回归整改结论（最终）

> 旧版报告中“Safari 实测正常”的结论已被用户现场 0% 卡死回归推翻并作废，以本节结果为准。

### 根因与整改

- 后端不可达时，启动错误被绘制在浅色背景上且进度停留在 0%/5%，用户看到的是永久卡死，而不是可恢复失败。
- `assetManager.loadBundle`、`director.preloadScene`、`director.loadScene` 原先没有超时保护，Creator 回调不触发时 Promise 永不结束。
- 进度计算没有完整覆盖 `total=0`、重复回调、场景预加载完成但切换失败。
- 现已为版本初始化、公共 Bundle、场景预加载、场景切换分别增加真实超时；进度只随真实阶段推进且单调递增。
- `total<=0` 不再除零或伪造完成；所有异步回调均防重复完成，并在阻塞状态下停止继续切场景。
- 失败统一显示原生 `ErrorPanel`、中文原因和 `重新连接` 按钮；恢复服务后通过同一按钮重新执行真实版本检查并进入 `LoginScene`。
- 未跳过版本检查、未使用 mock、未静态设置 100%、未恢复 `Native` 路径，也未修改 `LoginScene` 的节点、布局、图片或层级。

### 真实链路验证

| 验证项 | 结果 |
|---|---|
| 后端不可达 | 10 秒内显示中文可重试错误，不再无限停在 0% |
| 服务恢复后重试 | 同页点击 `重新连接`，重新请求真实 Gateway/Version 服务并进入 `LoginScene` |
| 全新页面/无缓存启动 | 使用 5 个独立 fresh URL 连续验证 5 次，全部进入 `LoginScene` |
| Console | 启动完成后无错误、无警告 |
| Network | 69 个真实请求，错误数 0；`common-prefab` 与主资源加载成功 |
| Creator Web Mobile 构建 | `build Task (web-mobile) Finished`；产物含 `assets/main/config.json` |
| viewport | 构建产物未检出废弃的 `minimal-ui` 参数 |
| 自动测试 | 16 项通过，0 失败 |

### 证据

- [服务不可达与重试界面](/Users/aoo/Code/Game/BCG/Aoo/Client/docs/前端框架规范/历史记录与证据/验收记录/111-bootstrap-unavailable-retry.png)
- [恢复服务后进入登录](/Users/aoo/Code/Game/BCG/Aoo/Client/docs/前端框架规范/历史记录与证据/验收记录/111-bootstrap-retry-recovered.png)
- [无缓存启动第 2 次](/Users/aoo/Code/Game/BCG/Aoo/Client/docs/前端框架规范/历史记录与证据/验收记录/111-bootstrap-success-2.png)
- [无缓存启动第 3 次](/Users/aoo/Code/Game/BCG/Aoo/Client/docs/前端框架规范/历史记录与证据/验收记录/111-bootstrap-success-3.png)
- [无缓存启动第 4 次](/Users/aoo/Code/Game/BCG/Aoo/Client/docs/前端框架规范/历史记录与证据/验收记录/111-bootstrap-success-4.png)
- [无缓存启动第 5 次](/Users/aoo/Code/Game/BCG/Aoo/Client/docs/前端框架规范/历史记录与证据/验收记录/111-bootstrap-success-5.png)
- [Network 与 Console](/Users/aoo/Code/Game/BCG/Aoo/Client/docs/前端框架规范/历史记录与证据/验收记录/111-bootstrap-network-console.png)

本次没有修改 `.scene`、`.prefab`、`.meta`、组件绑定或资源路径；Creator 3.8.8 正常构建已完成，因此不产生待编辑器同步项。

## 2026-08-25 正式本地运行环境闭环

上节依赖会话临时进程的验收方式再次作废。本节改为项目内正式模块和可重复启动入口，核心服务在验收结束后继续运行。

- 一键入口：`Server/tools/local-dev-services.sh start|status|stop|restart`。
- 正式模块：`BootstrapAPP version`、`BootstrapAPP account`、`GatewayApplication`。
- 正式端口：Gateway `8080`、Version `8095`、Account `8096`。
- 正式数据：MySQL `aoo_login_local`；启动时执行完整 Flyway，并仅在本地写入幂等服务器目录。
- 生命周期：macOS 使用项目目录内临时 LaunchAgent 注册，关闭终端后继续运行；`stop` 安全卸载。未写入系统 LaunchAgents，重启机器不会自动拉起生产风险；重启后再次执行 `start` 即可。
- 运维：PID 位于 `Server/work/local-runtime/core-services`，日志位于 `Server/logs/local-dev`，本机密钥位于被忽略且权限为 `600` 的 `Server/work/local-runtime/local-dev.env`。
- CORS：Creator `localhost/127.0.0.1` 预览端口使用精确白名单；实测预检和版本请求返回正确 `Access-Control-Allow-Origin`。
- 上游故障：Gateway 返回具体 `version/account` 服务、中文原因及 `traceId`，同时写入正式 Gateway 日志。
- 客户端：仍使用唯一正式地址 `http://127.0.0.1:8080/`，未增加直连、mock 或绕过。

### 最终实测

1. `stop -> status失败 -> start -> status成功` 完整重启通过。
2. 正式 Version 路由返回 `code=OK`、真实服务器目录和选中服务器。
3. 正式 Account 路由完成账号注册/登录与游客注册/登录，两条链路均返回轮换 Token 对。
4. Safari 使用用户当前 Creator 预览 `localhost:7457` 全新加载，启动界面真实推进并进入包含“游客登录、账号登录”的 `LoginScene`。
5. 修复 Creator 预览场景名瞬态差异导致的错误分支；只通过运行时代码识别 Boot_Strap，没有修改 `Login_Scene.scene`。
6. 移除已为空且不存在构建产物的 `login-prefab` 动态候选，避免游客登录成功后出现虚假 Bundle 404；未删除业务 Prefab。
7. Maven Gateway/VersionNotice/Account 相关测试通过；Client 自动测试 `16/16` 通过。
