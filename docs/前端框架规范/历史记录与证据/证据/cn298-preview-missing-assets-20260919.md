# CN298 Preview 缺失资源只读审计（2026-09-19）

## 结论

- 三次 CDP 1237 / Creator Preview 7456 运行共暴露 7 个缺失 UUID。
- 7 个 UUID 的引用均位于 Activity、Rewards、Club 或麻将公共小结算 Prefab；`Games/Poker/NN` 中没有这些引用，因此它们不是 CN298 迁移直接遗漏。
- 静态枚举 `CN298RoomLandscape.prefab` 的 12 个 UUID，均能在当前 `Client/assets/**/*.meta` 注册表中解析。横屏 CN298 没有静态缺失 UUID。
- `CN298RoomPortrait.prefab` 当前没有 UUID 资源引用。本审计只读，未修改该冻结资源。
- 7 个 UUID 在 Aoo 与 XQP 的 `Client/assets/**/*.meta` 中均不存在。修复时必须从可靠历史来源恢复原资源和原 `.meta`，不得新建 UUID 或把不相干资源改绑到这些 UUID。

## 精确缺失清单

| UUID | 类型与预期资源 | Preview 请求位置 | 当前引用范围 | 分类 |
| --- | --- | --- | --- | --- |
| `7ff29427-ffb3-4c5d-af00-5559dd8f086f` | `cc.TTFFont`，RichText 字体 | `activity-ui`、`rewards-ui`、`club` | 23 个 RichText：Activity `Draw`/`Tasks`/`Invite`、Rewards `InviteTask`、Club 多个消息与设置 Prefab | 既有全局缺失 |
| `432c2839-face-4a43-b734-edfe6aac76f4@f9941` | 微信分享按钮 SpriteFrame | `activity-ui` | `RoomCopy/bg/btn_wx`、`DrawResult/.../btnSure_wx`、麻将 `SmallSettleTpl_04/.../btn_share` | 既有社交分享资源缺失 |
| `73a21aab-8f2e-4bb0-85ef-d374353f06ea@f9941` | 钉钉分享按钮 SpriteFrame | `activity-ui` | `RoomCopy/bg/btn_dd`、`DrawResult/.../btnSure_dd`、麻将 `SmallSettleTpl_04/.../btn_ddshare` | 既有社交分享资源缺失 |
| `ee00c953-1004-4aa6-8a6f-00b1c87261ee@f9941` | 新浪分享按钮 SpriteFrame | `activity-ui` | `RoomCopy/bg/btn_xl`、麻将 `SmallSettleTpl_04/.../btn_xlshare` | 既有社交分享资源缺失 |
| `d8ad1b27-bdcd-41d0-adfd-20aa503b90a0` | 源 Prefab（非图片子资源） | `club` | `Club/Prefab/ClubDiamond.prefab` 内 21 个 `cc.PrefabInfo.asset` 实例引用 | 既有 Club 源 Prefab 缺失；原文件名需从历史仓库/备份恢复 |
| `148f292e-fd9e-4991-8857-85248333a58b@f9941` | Toggle `Background` SpriteFrame | `club` | `ClubPromoterSet` 与 `SetSportsPointWarning` 的 toggle1/toggle2 Background | 既有 Club 控件资源缺失 |
| `5130d1c4-bed4-4e80-9584-66677e173041@f9941` | Toggle `checkmark` SpriteFrame | `club` | `ClubPromoterSet` 与 `SetSportsPointWarning` 的 toggle1/toggle2 checkmark | 既有 Club 控件资源缺失 |

## 证据

- 创建与 CN298 权威状态：`cn298-horizontal-full-2026-09-19T06-25-01-271Z/report.json`
- 登录恢复与加入入口诊断：`cn298-horizontal-full-2026-09-19T06-30-57-297Z/report.json`
- 加入请求 409 与完整资源错误：`cn298-horizontal-full-2026-09-19T06-32-33-836Z/report.json`
- 上述运行中 8 个账号均请求缺失字体与分享资源；Club 资源只在桌面账号触发的后台预热路径出现。

## 后续修复窗口清单

1. 从可审计的历史仓库或备份确定 7 个 UUID 的原始文件名、文件内容及原 `.meta`；其中 `d8ad1b27-...` 必须恢复源 Prefab，而非修补 `ClubDiamond.prefab` 的实例数据。
2. 恢复资源与原 `.meta` 后，通过 Creator 3.8.8 正常导入，禁止伪造 Library 缓存。
3. 重新打开 Activity、Rewards、Club 与 `SmallSettleTpl_04` 引用 Prefab，确认 Inspector 不再显示 Missing。
4. 用独立 CDP Profile 重跑登录、大厅预热、CN298 创建/加入；确认上述 7 个 UUID 的所有 `/import/` 请求均为 200，且 Creator 控制台不再产生对应缺失错误。
5. CN298 横屏当前 12 个 UUID 已完整注册，不应在这次全局资源修复中改绑或重存；Portrait 继续保持冻结。
