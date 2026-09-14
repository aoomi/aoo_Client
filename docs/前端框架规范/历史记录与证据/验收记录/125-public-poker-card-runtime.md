# 公共扑克牌运行时统一审计

## 唯一调用链

`games-common-prefab/Poker_Card` -> `Poker_Card_Presenter` -> `Poker_Card_Factory` -> 玩法容器。

公共工厂唯一负责协议牌值到点数、花色、大小王及正反面的转换。玩法代码只能决定容器、实例缩放和选中位移，不得再次加载牌面图集或复制牌模板。

## 逐玩法迁移表

| 玩法/模块 | 盘点到的牌面入口 | 使用场景 | 运行状态 | 本轮结果 |
| --- | --- | --- | --- | --- |
| PDK / NJPDK | `Room/CardPresenter.ts`，旧 `common-poker-card/card` | 手牌、出牌、选中 | 正式运行可达 | 已统一到公共工厂 |
| NJPDK 回放 | `LegacyNJPdkCardRenderer.ts`，旧 `legacy-ui/new_poker` | 手牌、出牌、回放 | 正式运行可达 | 已统一到公共工厂；旧 Renderer 删除 |
| XCPDK | Client 未发现独立牌面 TS 入口 | 房间牌面 | 由公共 PDK 房间链承载 | 公共链已覆盖；待真实 XCPDK 发布链验收 |
| ZJH / 比牌类 | 牌面引用序列化在旧玩法或结算 Prefab | 手牌、公共牌、比牌、结算 | 未发现可独立替换的 TS 入口 | 修改 Prefab 才能迁移，按边界暂停 |
| 牛牛/斗牛 | `nn_cardPrefab` 等序列化资源 | 手牌、摊牌、结算 | 旧 Prefab 组件驱动 | 修改 Prefab 才能迁移，按边界暂停 |
| 斗地主/三公等 Poker 玩法 | 旧 cardPrefab / winlost Prefab | 手牌、出牌、结算 | 旧 Prefab 组件驱动 | 修改 Prefab 才能迁移，按边界暂停 |
| AYCP | `AYCPPlay.prefab` / `cardPrefab.prefab` 序列化绑定 | 手牌、出牌、头像牌面 | 原生资源存在 | 修改 Prefab 才能迁移，按边界暂停 |
| AYDSS / A3PK | native-ui 玩法 Prefab 与旧依赖资源 | 手牌、出牌、结算 | 未发现统一 TS 单牌入口 | 修改 Prefab 才能迁移，按边界暂停 |
| Poker 结算模板 | `Settle_big` 及 SettlementDependencies 中的 cardPrefab | 动态结算牌面或装饰牌图 | 混合 | 无法只凭序列化文本可靠区分动态/装饰；未擅改 |

`Client/assets/Lobby/Prefab/uiGame-001/**` 未扫描、未触碰、未纳入结论。

## 删除与保留

已删除：

- `LegacyNJPdkCardRenderer.ts` 及 meta。
- CompatibilityApp 中该 Renderer 的无引用转发文件及 meta。
- PDK/NJPDK 运行代码中的 `common-poker-card` 与 `legacy-ui/new_poker` 加载入口。

暂时保留：

- `Games/Poker/Common/Prefab/poker_card/**`：旧 Bundle 当前仍可能被序列化 Prefab 引用，尚未证明全项目资源引用为零。
- 各玩法 cardPrefab、结算模板和静态装饰牌图：需要对应 Prefab owner 区分动态牌面与装饰资源后迁移。

## 当前阻塞

PDK/NJPDK 代码链已完成。其余扑克玩法需要修改现有玩法 Prefab，而本任务明确禁止擅改这些 UI 资产，因此全扑克项目不能诚实签署为全部完成。至少一种非 PDK 玩法的真实正面、背面、点数和花色验收必须在对应 Prefab owner 授权迁移后执行。
