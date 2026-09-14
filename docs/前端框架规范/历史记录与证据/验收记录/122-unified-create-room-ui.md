# 122 统一创建房间 UI 与真实建房闭环

> 本报告的视觉完成结论已于 2026-08-26 被现场稽核撤销；最终整改与重新验收结果以 `123-approved-create-room-layout.md` 为准。本文件仅保留为历史证据，不再作为完成依据。

## 结论

大厅“创建房间”已从旧独立地区选择流程切换为唯一的 Creator 3.8.8 原生统一创建房间界面，并完成真实点击、真实目录、真实规则、真实 Hall RoomCreateSaga、一次性票据、Gateway WSS 和 PDK 房间进入验证。

地区仅作为玩法分类标签。NJPDK 的展示分类为内江 `CN-51-10`，权威发布索引和服务路由仍由正式 Provider/Compiled Index 决定，地区标签不参与账号、钱包、房卡、房间或 Authority 路由隔离。

本轮未执行、未写入任何“多背景资源层级、默认背景首包、其余背景静默下载”相关修改；该方案保持暂停讨论状态。

## 根因与修复

| 项目 | 根因 | 修复结果 |
|---|---|---|
| 旧地区页面仍可达 | 大厅按钮仍进入旧地区中转语义，统一选择器主界面与添加玩法弹窗职责未彻底分开 | 大厅只保留统一创建房间入口；主界面先显示，只有点击“添加玩法”才打开分类弹窗 |
| UI 白块和空文本 | 动态模板 Label 获取错误，且旧模板皮肤/文字布局不适合 Creator 3.8.8 | 使用原生 Button/Sprite/Label 模板、现有按钮皮肤和项目字体策略，文字可见且不再出现白块 |
| 内江玩法无法展示 | Hall 将玩法分类地区 `aoo_game_region.region_code` 错误绑定到 Authority 编译索引地区 | 分类 join 与 Authority index region 解耦；新增内江分类 `CN-51-10`，NJPDK 629 归入内江标签 |
| 建房后无法证明权威闭环 | 仅 UI/API 检查不能证明 Saga、票据、WSS 和运行房间一致 | 使用正式本地数据库和服务创建房间 `100038`，确认 Saga、票据、Authority route、玩家席位及持续心跳 |

## 修改文件

| 文件 | 修改内容 |
|---|---|
| `Client/assets/Lobby/Code/Runtime/UnifiedPlaySelectorController.ts` | 统一主界面/添加玩法弹窗、真实筛选/目录/Schema/建房链、Label 原生模板绑定 |
| `Client/assets/Lobby/Prefab/UnifiedPlaySelector.prefab` | Creator 3.8.8 原生主界面、添加玩法弹窗、滚动容器、按钮与模板；保留 UUID `c865cc8c-6845-45d2-b275-2f776da30340` |
| `Client/tests/unit/unified-create-room-ui.test.mjs` | 主界面、添加玩法、动态模板和地区仅分类门禁 |
| `Server/server/Hall/src/main/java/com/aoo/bcg/hall/room/JdbcHallRepository.java` | 分类地区与 Authority 编译索引地区解耦 |
| `Server/server/Hall/src/test/java/com/aoo/bcg/hall/room/JdbcHallRepositoryTest.java` | 防止分类 join 再次绑定 `region_code` |
| `Server/database/local/seed_local_runtime.sql` | 本地正式数据补齐内江分类和 NJPDK 标签 |
| `Server/database/migrations/V20260826_07__njpdk_neijiang_classification.sql` | 正式幂等迁移：内江标签、别名、NJPDK 分类和旧省级分类退役 |
| `docs/Aoo-统一大厅玩法选择与创建房间产品方案.md` | G01 更新为真实完成状态 |

## 真实服务与数据库证据

| 项目 | 结果 |
|---|---|
| Hall 玩法筛选 | `ALL`、`CN`、`CN-51`、`CN-51-10` 均由 `/api/v2/hall/play-filters` 返回 |
| 内江目录 | `/api/v2/hall/catalog?regionCode=CN-51-10` 返回 NJPDK `gameId=629`、`poker:pao-de-kuai`、`playVersion=legacy-equivalent-1` |
| 房间 | `roomId=100038`、`gameId=629`、`state=OPEN`、玩家 `accountId=146` 已加入 `seat=0` |
| Saga | `step=CONFIRMED`、`attemptCount=0`、`failureCode` 为空、`traceId=b21cfc36-58be-4e03-986b-4e6ab72cd3df` |
| 一次性票据 | 已消费，路由 `ws://127.0.0.1:8080/api/v2/gateway/ws` |
| Authority route | `gateway-1`、`fencingToken=1`、`lifecycleState=ACTIVE`，trace 与 Saga 一致 |
| 心跳稳定性 | 进入房间后等待超过一个心跳窗口，页面仍保持房间 `100038`，无断线弹窗 |

## 视觉证据

| 编号 | 证据 |
|---|---|
| A | `docs/前端框架规范/历史记录与证据/验收记录/evidence/122-a-lobby-create-room.png` |
| B | `docs/前端框架规范/历史记录与证据/验收记录/evidence/122-b-create-room-main.png` |
| C | `docs/前端框架规范/历史记录与证据/验收记录/evidence/122-c-add-game-popup.png` |
| D | `docs/前端框架规范/历史记录与证据/验收记录/evidence/122-d-sichuan-neijiang-njpdk-rules.png` |
| E | `docs/前端框架规范/历史记录与证据/验收记录/evidence/122-e-real-pdk-room.png` |

## 测试与构建

| 命令 | 结果 |
|---|---|
| `./mvnw -Dexec.skip=true -pl server/Hall -am test` | PASS，Hall 13/13，Reactor BUILD SUCCESS |
| 统一创建房间相关 Node 定向测试 | PASS，13/13 |
| Creator 3.8.8 Web Mobile 构建 | 构建任务完成并产生可运行 `web-mobile-unified`；CLI 最终退出码 36 来自 Creator 内部 build-script 结束信号，实际产物已完成真实点击全链 |
| `bash scripts/verify-build.sh` | 211/212 PASS；唯一失败为并发任务未保存的 `Games/Poker/PDK/Common/Prefab/PDK_CommonRoom.prefab*` 命名/占位节点门禁 |

## Creator 同步与并发边界

Creator 3.8.8 构建导入、序列化、运行预览和真实 Web 点击均通过，统一创建房间 Prefab 无 UUID、组件或反序列化错误。

当前 Creator GUI 正被另一任务未保存的 `PDK_CommonRoom.prefab*` 占用。为遵守并发与用户 UI 保护规则，本任务没有保存、关闭、重命名、修改或豁免该 Prefab，也没有强制关闭 Creator。该外部文件是全项目命名门禁唯一剩余失败，不影响本次统一创建房间真实链结论。

## 清理与保护

- 旧独立地区选择运行入口、旧创建房间语义和旧地区权威输入均不可达，相关门禁通过。
- 未创建兼容别名、假地区、假 roomId、mock 成功或直接跳场景分支。
- 未触碰 `Client/assets/Lobby/Prefab/uiGame-001/**`。
- 未删除、移动或改名任何用户手动目录。
- 未触碰并发未保存的 `PDK_CommonRoom.prefab*`。
- 背景资源下载与多背景目录方案零修改并保持暂停。
