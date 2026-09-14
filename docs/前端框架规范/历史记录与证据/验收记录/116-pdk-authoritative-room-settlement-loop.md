# 116 PDK 权威房间与结算闭环终验

## 结论

状态：通过。

跑得快已使用唯一房间根预制体、正式 Gateway/Hall/Room Authority、NJPDK Provider、独立 Poker 结算 Bundle 和服务端权威结算数据，完成 4 人 8 局真实牌局闭环。未使用 mock、静态成功、假 roomId、旧 `uiGame` 路径或客户端权威状态。

## 权威资源

| 职责 | 路径 | UUID / Bundle |
|---|---|---|
| 跑得快房间根 | `assets/Games/Poker/Packs/Pack01/Prefab/Pdk/PaoDeKuaiRoom.prefab` | `521576d2-2288-48cb-87b4-c6bfd8d45230` / `poker01-prefab` |
| 跑得快默认小结算 | `assets/Games/Poker/PDK/Common/Prefab/SmallSettlement.prefab` | `1ed27244-8d2d-4ff3-b854-ab1f21853f7e` / `poker-small-settle` |
| 跑得快大结算 | `assets/Games/Poker/Common/Prefab/BigSettle/BigSettleTpl_110.prefab` | `4e1803d4-0bc6-4e0e-907d-5ad360f62eb1` / `poker-big-settle` |

`SmallSettlement` 以跑得快真实横版小结算为基准等价迁移，覆盖玩家列表、单局分数、赢家/输家表现和继续操作；其资源进入 Poker 权威 Atlas。Prefab 中 8 个废弃 `cc.LabelOutline` 已删除，保留 Creator 3.8.8 `cc.Label` 原生描边属性，避免重复渲染和编辑器警告。

Poker 小结算按玩法族默认解析：`pao-de-kuai` 自动取 `SmallSettlement`；只有后台明确选择特殊模板时才使用所选模板。其他牌类及 Poker 大结算未配置时使用本牌类 `Tpl_00`；禁止跨牌类回退。

## 服务端闭环

- `JdbcGatewayGameCommandCommitter` 在权威命令提交后以同一幂等边界登记结算。
- `DurableGameSettlementService` 将单局结算、玩家分数、回放和 outbox 持久化。
- `JdbcSettlementRepository` 原子写入结算主记录与逐玩家分数。
- `GatewayRoomBroadcastHub` 按接收玩家生成裁剪视图，禁止其他玩家暗牌下发。
- Hall V2 提供战绩、详情和回放；非参与者请求 fail-closed。
- 结算 outbox 有有界批量恢复线程，Gateway 关闭时显式 `shutdownNow()`，无后台线程泄漏。

数据库迁移补齐：

- `V20260826_01__njpdk_four_player_publication.sql` 的 4 人费用策略仅在权威 `aoo_play_version` 已存在时写入，空库迁移不再违反外键。
- `V20260826_04__durable_settlement_outbox_and_score_backfill.sql` 建立 durable outbox 和分数回填结构。
- `V20260825_96__remove_player_profile_region_identity.sql` 复用 `V20260825_92` 唯一拥有的地区历史快照表，不再重复声明 DDL owner。

## 真实动态证据

房间 `100026`，玩法 `NJPDK / legacy-equivalent-1`，4 名真实游客账号，8 局全部由正式 WSS 权威命令完成：

| 局 | 操作数 | 胜者座位 |
|---:|---:|---:|
| 1 | 57 | 1 |
| 2 | 81 | 0 |
| 3 | 65 | 3 |
| 4 | 70 | 3 |
| 5 | 60 | 0 |
| 6 | 63 | 2 |
| 7 | 53 | 3 |
| 8 | 73 | 2 |

终局：`matchFinished=true`、`canContinue=false`。数据库存在 8 条结算、32 条玩家分数、8 份回放清单、1517 条回放事件，逐局分数和为 0，outbox 待处理数为 0。

服务重启后再次验证：战绩 HTTP 200、详情 8 局、回放 HTTP 200、非参与者拒绝、WSS 收到 `common.room.state_push`，并验证接收者视角裁剪。

证据：

- `/tmp/aoo-pdk-full-loop/pdk-full-match-authoritative-final.log`
- `/tmp/aoo-pdk-full-loop/pdk-round-result.json`
- `/tmp/aoo-pdk-full-loop/history-replay-wss-proof.json`
- `/tmp/aoo-pdk-full-loop/history-replay-wss-proof-rerun.log`

## Creator 与构建

- Creator 3.8.8 中分别重新导入、打开、保存、关闭并重开 `PaoDeKuaiRoom`、`SmallSettlement`、`BigSettleTpl_110`。
- 三个目标资源 fresh console：Error 0，Warning 0。
- Web Mobile 构建成功：`Client/build/web-mobile-001`。
- 八个结算 Bundle 均生成 `config.json` 和 `index.js`，Bundle 名唯一；目标三个 PDK Prefab 均进入预期 Bundle。
- `uiGame-001` 是用户私有备份，始终不在本任务扫描、修改或门禁范围内。

## 自动化终验

```text
Client: bash scripts/verify-build.sh
结果: 193/193 通过
证据: Client/work/pdk-client-verify-final.log

Server: AOO_IT_DB_CONTAINER=aoo-mysql AOO_IT_TASK_ID=pdk_final_20260826d ./tools/verify-clean-with-integration-db.sh
结果: 43 模块 clean test 全部 SUCCESS；隔离空库迁移与集成验证通过
证据: Server/work/pdk-server-clean-integration-final.log
```

正式本地服务重启后健康：Gateway `8080`、Version `8095`、Account `8096`、Hall `8093`、Room Authority `18080`。

## 删除与替代

- 删除 Bootstrap 旧 `RecordReplayHttpRoutes`，战绩和回放只保留 Hall V2 权威入口。
- 删除 PDK 小结算 Prefab 的 8 个废弃 `cc.LabelOutline` 组件及对应序列化元数据。
- 客户端加入房间统一走 Hall HTTPS join + wsTicket + Gateway WSS，不保留假 roomId 或直接跳场景路径。
- 不保留 `Lobby/Prefab/uiGame` 运行时结算加载、旧动态路径或 PDK 结算兼容 fallback。

剩余阻塞：0。
