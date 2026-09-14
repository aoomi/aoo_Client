# Aoo 统一大厅与全链收口报告

## 结论

统一大厅、地区标签化、权威建房、NJPDK 真实房间链、结算模板、字体去重、Admin 配置、数据库迁移和八个结算 Bundle 已形成可重复验证闭环。用户私有备份 `Client/assets/Lobby/Prefab/uiGame-001/**` 始终不在任务范围内。

## 本轮修正根因

1. `V20260826_05` 曾尝试修改不可变 ACTIVE 发布；现仅更新 STAGED 发布。
2. `V20260826_06` 曾依赖不存在的 `JSON_EQUALS`，并把 Poker family 限制得过窄；现使用对称 `JSON_CONTAINS`，允许规范 `poker:*` family，并以新 release/index 发布。
3. 本地 seed 每次启动会把 629 指针回退到 generation 4，并造成双 ACTIVE；现改为仅初始化，随后幂等收敛到最新 ACTIVE release/index。
4. Gateway 仅转发 `X-Idempotency-Key`，而正式 Client 使用标准 `Idempotency-Key`，导致 Hall 拒绝建房；现 CORS 与代理链均转发标准头，并保留 wsTicket 所需旧头语义。

## 权威运行结果

- 正式本地服务：Gateway `8080`、Hall `8093`、Version `8095`、Account `8096`、Room Authority `18080` 健康。
- NJPDK 629：ACTIVE release `629000005`、index generation `5`、family `poker:pao-de-kuai`。
- 真实 Guest 注册/登录、Hall Catalog、建房、重复幂等请求、room ticket、Gateway WSS 均通过。
- 建房产生真实 room `100027`；后续幂等烟测产生 `100028`，相同 `Idempotency-Key` 返回同一结果。
- PDK 2/3/4 人、8 局、断线重连、小结算、下一局、大结算、战绩和回放闭环证据见 [116-pdk-authoritative-room-settlement-loop.md](./116-pdk-authoritative-room-settlement-loop.md)。

## 构建与测试

- Client：`bash scripts/verify-build.sh`，199/199 通过，新增命名门禁已纳入全量链。
- Admin：`bash scripts/verify-build.sh`，ESLint、类型检查、15 个 Vitest、API 台账、构建和依赖审计通过。
- Server：`./tools/verify-clean-with-integration-db.sh`，43 模块、隔离 MySQL migration、clean integration 全部通过，`BUILD SUCCESS`。
- Creator 3.8.8 Web Mobile：构建成功；八个结算 Bundle 全部生成；AssetDB 刷新、关闭重开和编辑器控制台阻塞错误为 0。

## 命名迁移边界

正式规范已写入唯一前端架构主文档。逐文件机器台账由 `scripts/verify-naming-conventions.mjs --write-ledger` 生成，自动测试禁止新增违规；历史协议类、旧 Creator 序列化资源和第三方 Admin 组件必须按台账逐步迁移，不能机械改名。负责人为 Aoo migration team，到期日为 2026-12-31。

## 删除与安全

- 删除了临时 token/closeout 证据文件，未保留可复用凭证。
- 旧地区选择运行入口、`legacy-data/*` 动态入口、旧结算加载路径及重复字体运行引用均由现有门禁阻断。
- 本地运行文件权限收敛为 owner-only。
- 未恢复 Native/Legacy 兼容路径，未建立假 roomId、假目录或 mock 成功链。

## 人工集中验收说明

当前 Codex 内置浏览器对本地 Creator 预览地址返回 `ERR_BLOCKED_BY_CLIENT`，因此浏览器画面点击作为集中人工验收项；这不影响正式 API/WSS 动态链、Creator AssetDB、Web Mobile 构建和自动化业务闭环结论。
