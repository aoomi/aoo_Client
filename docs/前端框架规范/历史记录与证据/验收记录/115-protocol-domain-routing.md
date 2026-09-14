# 115 大厅与房间权威协议分域验证

## 结论

“权威请求缺少 roomId”由客户端使用模糊 `room` 关键词分类协议导致。大厅启动查询 `game.C1101GetRoomID` 和亲友圈当前房间查询 `room.CBaseRoomConfig` 在房间会话建立前被错误送入 `common.room.dispatch`，因而被正确的房间权威门禁拒绝。

现已改为显式分域：

- `account.session_dispatch`、`hall.dispatch`、`club.dispatch`、心跳属于会话域，不进入房间运行时。
- 当前房间发现、回放查询等继承名称与大厅语义冲突的请求使用显式大厅路由登记。
- `common.room.dispatch`、`room.reconnect` 和游戏权威操作继续强制 `roomId`、`roundNo`、`playVersion`、`requestId`、`seq`。
- 禁止给大厅请求填充假 `roomId`，未放宽任何房间权威校验。

## 服务端正式能力

Gateway 使用 `WebSocketFrame.isNonRoomMessage` 作为唯一分域矩阵。非房间请求直接进入非房间 Dispatcher；其余请求必须先通过房间 Envelope 校验、SessionResolver、GameWebSocketRouter 和 RoomCommand 权威链。

大厅启动所需数据均来自正式数据库：

- 当前房间：`aoo_hall_room` 与 `aoo_hall_room_member`。
- 亲友圈邀请：`aoo_club_state` 中未接受且未过期的邀请。
- 联盟通知：`social_notification` 中当前账号的联盟通知。
- 地区和玩法目录：既有 `hall.regions`、`hall.catalog` 权威链。

## 修改文件

- `Client/assets/Common/Code/Runtime/network/ProtocolClient.ts`
- `Client/assets/Club/Code/Runtime/LegacyClubMainController.ts`
- `Client/tests/unit/protocol-domain-routing.test.mjs`
- `Server/server/Gateway/src/main/java/com/aoo/bcg/gateway/WebSocketFrame.java`
- `Server/server/Gateway/src/main/java/com/aoo/bcg/gateway/GatewayWebSocketFrameHandler.java`
- `Server/server/Gateway/src/test/java/com/aoo/bcg/gateway/GatewayWebSocketFrameHandlerTest.java`
- `Server/server/Bootstrap/src/main/java/com/aoo/bcg/bootstrap/JdbcHallWebSocketDispatcher.java`

## 验证结果

```text
Client: bash scripts/verify-build.sh
167 tests, 167 pass, 0 fail

Server: ./mvnw -Dexec.skip=true -pl server/Gateway,server/Bootstrap -am test
42 reactor modules SUCCESS; Gateway 40 tests pass; Bootstrap 8 tests pass

正式本地服务: ./tools/local-dev-services.sh restart
Gateway 8080 / Version 8095 / Account 8096 全部健康

正式游客登录 + wsTicket + WSS:
account login              PASS
game.C1101GetRoomID        PASS, roomID=0
hall.regions               PASS, 35
hall.catalog               PASS, 7
club.CClubInvited          PASS
union.CUnionNotify         PASS
common.room.dispatch 无 roomId  FAIL-CLOSED, code=1001

Creator 3.8.8 Web Mobile:
build Task (web-mobile) Finished in 21 s
```

## 浏览器边界

实际打开 `http://localhost:7456/` 后，Creator 预览宿主可访问，但 Codex 内置浏览器明确报告 `This device does not support WebGL`，Cocos 引擎在创建 WebGLSwapchain 前终止。因此该浏览器无法完成 Canvas 内可视点击；正式 HTTP/WSS 全链、Creator 构建和协议动态验收均已完成。最终 Canvas 点击保留给具备 WebGL 的 Creator/Chrome 集中验收。

本次未修改任何 Scene、Prefab、Meta 或 `LoginScene.scene`。
