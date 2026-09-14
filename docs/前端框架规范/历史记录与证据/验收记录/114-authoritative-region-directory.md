# 114 权威地区目录与旧资源入口清理验证

## 结论

- 大厅地区选择已由 Creator 2.2.2 的 `legacy-data/selectCity` 静态资源切换为正式 WSS `hall.regions`。
- 地区对应玩法通过正式 WSS `hall.catalog` 获取，服务端按有效地区、有效玩法和发布状态裁剪。
- 客户端仅展示服务端授权目录与本地 528 个玩法映射实现的交集。
- 运行时代码、动态字符串、JSON、Scene、Prefab 中 `legacy-data/*` 引用为 0。
- 未修改 `LoginScene.scene`，未修改任何 Scene、Prefab 或 Meta。

## 根因与清理清单

旧大厅和亲友圈控制器仍调用 Creator 资源加载器读取：

- `legacy-data/selectCity`
- `legacy-data/gameCreate`

这些旧入口会被 Creator 3.8.8 当作资源请求解析，并在大厅打开地区选择时抛出 `Can not parse this input`。现已移除全部运行时读取；创建房间配置迁移为原生 TypeScript 配置，地区目录和玩法目录改为服务端权威接口。

## 权威链路

1. `hall.regions` 返回当前可用的省、市，数据来自 `aoo_region`，并仅保留存在全国或地区有效玩法的地区。
2. 旧数值城市编号只作为数据库导入别名保存在 `aoo_region_alias`，客户端和服务端通信始终使用规范 `regionCode`。
3. `hall.catalog` 接收 `regionCode`，返回该地区与全国性玩法的并集。
4. 客户端再与本地 R04 运行实现映射求交集，不展示未授权或无实现玩法。
5. 亲友圈地区名称和可用玩法复用同一权威链路；失败时显示明确中文错误并允许重试。

## 实际服务验证

使用正式本地 Gateway、Version、Account、数据库和 WSS 完成游客注册、登录、一次性票据、角色登录、地区目录及玩法目录请求：

- `hall.regions`：35 个授权省市。
- `hall.catalog`：测试地区返回 7 个正式授权玩法。
- 返回内容包含真实玩法族，例如 `MAHJONG_STANDARD`、`POKER_PAO_DE_KUAI`。
- R04 映射门禁：4 个基础牌类、15 个玩法族、32 个 runtime archetype、528 个配置映射。

## 自动验证

```text
Client: bash scripts/verify-build.sh
结果: 166 tests, 166 pass, 0 fail

Server: ./mvnw -Dexec.skip=true -pl server/Bootstrap -am test
结果: 42 reactor modules SUCCESS; Bootstrap 8 tests pass; BUILD SUCCESS

旧路径门禁:
rg --glob '*.{ts,js,json,scene,prefab}' 'legacy-data/' assets
结果: PASS, runtime references = 0

Creator 3.8.8 Web Mobile:
结果: build Task (web-mobile) Finished in 21 s
```

新增门禁 `tests/unit/no-legacy-data-runtime.test.mjs` 会递归扫描 TypeScript、JavaScript、JSON、Scene 和 Prefab，今后任何旧资源路径重新进入生产资源都会使构建失败。

## 编辑器同步边界

本次最终整改仅修改 TypeScript、Java、SQL、测试和文档；没有修改 Scene、Prefab 或 Meta，因此无需场景关闭重开。新增原生 TypeScript 配置此前已由 Creator 3.8.8 正常导入并生成 Meta，Web Mobile 构建通过，未伪造 `library` 缓存。

## 剩余验收边界

自动化、正式 WSS 和 Creator 构建已通过。Codex 内置浏览器当前无 WebGL，无法在该环境完成可视化点击截图；地区选择的最终视觉点击由统一 Creator/WebGL 集中验收执行，不影响本次代码和协议链路通过结论。
