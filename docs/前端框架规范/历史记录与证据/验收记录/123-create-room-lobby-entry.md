# 123 大厅创建房间真实链路终验

## 结论

状态：**通过**。

2026-08-26 使用 Cocos Creator 3.8.8 正式 Web Mobile 构建和正式本地多进程服务，完成以下真实点击链：

`启动 -> 游客登录 -> 大厅 -> 创建房间 -> UnifiedPlaySelector -> NJPDK -> 创建 -> Hall RoomCreateSaga -> Gateway Authority -> 一次性游戏票据 -> WSS -> PaoDeKuaiRoom`

最终房间为 `100037`，界面显示 `房间号：100037`、`局数：0/8`，进入后持续 42 秒跨过 Social 轮询和 WSS 心跳窗口，当前页面新增 `error/warn=0`。

## 根因与整改

1. 大厅 Social 服务此前未纳入正式本地拓扑，且使用独立 HMAC 身份体系。现已由 Gateway 精确代理到正式 Social 服务，Social 通过 Account 会话权威校验短期 access token。
2. 大厅曾把 refresh token 用作生产 API bearer。现已统一使用短期 access token，缺失时 fail-closed。
3. Account 登录和大厅 API 各自生成不同设备标识，导致 `stale or mismatched session`。现由 `resolveRuntimeDeviceId()` 唯一生成、持久化并供登录、HTTP 和 WSS 共用。
4. 大厅节点销毁后 Social 异步轮询仍执行 `emit`。现增加活动状态、节点有效性门禁和定时器停机，销毁后的异步结果不再访问 Cocos 节点。
5. NJPDK 权威快照缺少旧 UI 读取的 `key` 和 `cfg.setCount`。适配器现从权威 `roomId/roundLimit` 映射，房间号和总局数真实显示。

## 修改清单

### Client

- `assets/Common/Code/Runtime/config/RuntimeEndpoints.ts`
- `assets/Common/Code/Runtime/Activity/ProductionApiClient.ts`
- `assets/Login/Code/Auth/UnifiedIdentityAuthGateway.ts`
- `assets/Lobby/Code/Runtime/LegacyLobbyScreen.ts`
- `assets/Lobby/Code/Runtime/Social/LegacySocialController.ts`
- `assets/Games/Poker/Packs/Pack01/Code/Runtime/njpdk/NJPdkAuthoritativeViewAdapter.ts`
- `tests/unit/production-edge-routing.test.mjs`
- `tests/unit/legacy-lobby-production-bridge.test.mjs`
- `tests/unit/enter-game-authoritative-chain.test.mjs`
- `tests/unit/social-friend-notification-flow.test.mjs`
- `tests/unit/poker-authoritative-chain.test.mjs`

### Server

- `server/Social/src/main/java/com/aoo/bcg/social/SocialPrincipal.java`
- `server/Social/src/main/java/com/aoo/bcg/social/SocialRequestAuthenticator.java`
- `server/Social/src/main/java/com/aoo/bcg/social/SocialHttpRoutes.java`
- `server/Social/src/main/java/com/aoo/bcg/social/SocialService.java`
- `server/Social/src/test/java/com/aoo/bcg/social/SocialServiceIntegrationTest.java`
- `server/Bootstrap/src/main/java/com/aoo/bcg/bootstrap/BootstrapAPP.java`
- `server/Gateway/src/main/java/com/aoo/bcg/gateway/HttpRoutePolicy.java`
- `server/Gateway/src/main/java/com/aoo/bcg/gateway/GatewayApplication.java`
- `server/Gateway/src/test/java/com/aoo/bcg/gateway/HttpGatewayContractTest.java`
- `tools/local-dev-services.sh`
- `tools/healthcheck-local.sh`

删除的旧并行认证实现：

- `server/Social/src/main/java/com/aoo/bcg/social/SocialAuthenticator.java`
- `server/Social/src/test/java/com/aoo/bcg/social/SocialAuthenticatorTest.java`

本轮未修改任何 scene、prefab、节点、布局、图片、字体、动画或序列化 UI 属性；未触碰 `uiGame-001` 和用户手动目录。

## 自动测试与构建

1. Client：`bash scripts/verify-build.sh`
   - 208 tests，208 pass，0 fail。
2. Server：`./mvnw -pl server/Social,server/Gateway,server/Bootstrap -am -Dexec.skip=true test`
   - 42 模块 reactor `BUILD SUCCESS`。
   - Gateway 42/42、Social 4/4、Bootstrap 8/8。
3. Cocos Creator 3.8.8 Web Mobile：
   - 2026-08-26 16:30:51 构建成功，耗时 50 秒。
4. 正式本地服务健康状态：
   - Gateway 8080、Version 8095、Account 8096、Hall 8093、Social 8097、Authority 18080 全部 `OK`。

## 动态权威证据

- RoomCreateSaga：
  - `room_id=100037`
  - `game_id=629`
  - `play_version=legacy-equivalent-1`
  - `step=CONFIRMED`
  - `attempt_count=0`
  - `trace_id=14cb8ab4-5abc-4840-acfd-36be6d117778`
- Authority route：
  - `lifecycle_state=ACTIVE`
  - `node_id=gateway-1`
  - `authority_endpoint=ws://127.0.0.1:8080/api/v2/gateway/ws`
  - `fencing_token=1`
  - 租约在进入房间后持续续期。
- 一次性游戏票据：
  - 创建时间 `08:32:17.273`
  - 消费时间 `08:32:17.329`
  - 未消费登录票据数 `0`
- Social presence：账号 `140` 为 `ONLINE`，正式 Account 会话鉴权通过。
- 浏览器：最终全链新增 `error/warn=0`。

## 截图证据

- `evidence/123-create-room/01-unified-selector.png`
- `evidence/123-create-room/02-room-100037-after-heartbeat.png`

## 剩余阻塞

`0`
