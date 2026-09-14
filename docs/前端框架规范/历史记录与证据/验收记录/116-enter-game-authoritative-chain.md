# 116 进入游戏权威链验证

## 状态

部分完成，最终动态验收阻塞，不能标记通过。

## 已修复

- `btn_create` 保留 Creator 原生 `Button`、有效点击区域和可交互状态，未改 Prefab 布局。
- 普通建房不再发送旧 `room.CBaseCreateRoom` 后等待 `MqResponseBo`。
- 新增 `HallRoomGateway`：按地区拉取权威目录，经 Gateway HTTPS 创建房间、签发一次性游戏票据，再提交包含 `roomId/gameId/playVersion/authorityRoute/gameTicket` 的交接数据。
- 同一建房操作采用 single-flight，重复点击不会产生多次房间写入。
- Gateway 增加 `/api/v2/hall/*` 明确代理，查询参数不再被 WebSocket URL 参数门禁误拦截。
- 本地正式服务拓扑增加 Hall 8093、健康检查和安全停止；数据库增加服务端房间号序列表。

## 验证结果

- Client `bash scripts/verify-build.sh`：169/169 通过。
- Server `./mvnw -Dexec.skip=true -pl server/Hall,server/Gateway,server/Bootstrap -am test`：42 模块通过。
- Gateway 定向 Reactor：40 项 Gateway 测试通过。
- 正式本地服务：Gateway 8080、Version 8095、Account 8096、Hall 8093 均健康。
- 正式游客注册/登录成功；经 Gateway 请求 Hall 目录成功，但本地数据库返回空目录。

## 最终阻塞

当前正式数据库没有任何 `aoo_compiled_index_active` 和 `aoo_game_service_route` 数据，且没有 `njpdk(629)` 目录发布记录。更关键的是 Hall 创建成功后，独立 Gateway 进程中的 `RuntimeGameRoomRegistry` 没有跨进程房间创建/恢复入口；`ProductionGatewayRuntimeProvider` 的会话解析会直接 `rooms.require(roomId)`。因此即使临时插入目录数据，房间权威运行时仍不存在，不能伪造为“已进入游戏”。

需要由后续任务完成正式 Room Authority 创建端口：Hall 创建 Saga 通过可持久化内部命令创建/恢复 Gateway 权威房间，并补齐 629 的已发布配置与路由。禁止用假目录、假 roomId、静态成功或直接跳场景规避。

WebGL 视觉点击仍按既定集中验收边界暂缓。
