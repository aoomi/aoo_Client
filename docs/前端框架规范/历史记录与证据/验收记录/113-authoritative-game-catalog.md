# 113 大厅权威玩法目录整改

## 状态

已完成自动化与正式本地服务链路验收。Creator 页面视觉点击按协调任务统一安排集中验收，本项未修改任何 scene、prefab 或 meta，也未修改 LoginScene。

## 根因

大厅和亲友圈仍通过 Creator `resources.load` 读取已删除的 `legacy-data/gametype`，地区切换和赛事房间编辑仍调用旧 `room.CBaseGameIdList`。服务端虽有 R04 的 528 项运行绑定，但正式 WSS 尚无权威玩法目录动作；本地数据库也没有已启用目录数据。

## 整改

- 新增正式 WSS 动作 `hall.catalog`，仅返回数据库中 `ACTIVE + AVAILABLE + 已激活玩法版本` 的地区授权项，同时叠加 `GLOBAL` 全国玩法。
- 大厅与亲友圈全部移除 `legacy-data/gametype` 和 `CBaseGameIdList`。
- 客户端以服务端返回的 gameId 为授权集合，再与 R04 的 528 项 Creator 3.8.8 运行实现映射求交集。
- 将 528 项不可变运行绑定与 528 项显示元数据分表，保留 4 基础牌类、15 核心玩法族的既有签名门禁。
- 正式本地种子发布 7 个已启用全国玩法；并登记真实牌类、玩法族和 `1.0.0` 激活版本。生产发布仍由管理后台控制。

## 验证

- `Client/bash scripts/verify-build.sh`：165/165 PASS。
- 旧路径门禁：`legacy-data/gametype` 和 `CBaseGameIdList` 均为 0。
- `Server/./mvnw -Dexec.skip=true -pl server/Bootstrap -am test`：42 模块 SUCCESS，Bootstrap 8/8 PASS。
- `Server/tools/local-dev-services.sh restart`：Gateway 8080、Version 8095、Account 8096 全部健康。
- 正式游客注册、登录、一次性 wsTicket、WSS 角色登录、`hall.catalog`：PASS；地区 `1041301` 返回 7 个 GLOBAL 授权玩法，字段含 gameId、gameCode、displayName、category、family、playVersion。
- Creator 3.8.8 Web Mobile：日志明确 `build Task (web-mobile) Finished in (20 s)`；CLI 最终 36 为 Creator 清理退出码，不是构建失败。

## 主要修改文件

- `assets/Games/Common/Code/FamilyRuntimeRegistry.ts`
- `assets/Games/Common/Code/CatalogFamilyBindings.ts`
- `assets/Lobby/Code/Runtime/LegacyGameCatalogController.ts`
- `assets/Lobby/Code/Runtime/LegacyRegionController.ts`
- `assets/Lobby/Code/Runtime/LegacyLobbyScreen.ts`
- `assets/Club/Code/Runtime/LegacyClubEntryController.ts`
- `assets/Club/Code/Runtime/LegacyClubPlayerRecordController.ts`
- `assets/Club/Code/Runtime/LegacyUnionManagerController.ts`
- `assets/Club/Code/Runtime/LegacyClubMainController.ts`
- `assets/Club/Code/Runtime/LegacyUnionZhongzhiRankController.ts`
- `tests/unit/authoritative-game-catalog.test.mjs`
- `Server/server/Bootstrap/src/main/java/com/aoo/bcg/bootstrap/JdbcHallWebSocketDispatcher.java`
- `Server/database/local/seed_local_runtime.sql`
