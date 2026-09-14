# 123 统一创建房间确认布局与真实入房终验

## 结论

此前 v4 报告因“更多玩法”仍缺少真实省市分类、卡片网格和筛选证据而撤销。本轮以 Creator 3.8.8 Web Mobile v9 重新完成并真实点击验证：游客登录进入大厅，点击“创建房间”，打开统一主界面，再打开“更多玩法”，看到真实的四川省、四川/成都/内江分类以及 PDK、内江跑得快两张已发布卡片；点击“内江玩法”和“内江跑得快”后加载 NJPDK 权威 Schema，最终创建房间 `100041` 并经一次性票据、Gateway WSS 进入 PDK 原生房间。

地区仅参与玩法目录筛选，未进入账号、资产、房卡、房间或服务路由隔离。

## 完成的信息架构

| 区域 | 最终职责 |
|---|---|
| 左侧 | 热门/已添加玩法列表，当前选中玩法有明确状态 |
| 右侧 | 服务端 Schema 动态生成局数、人数、支付和玩法规则 |
| 顶部 | 规则、分享、重置 |
| 底部 | 删除、更多玩法、预约、创建房间和公共选项 |
| 更多玩法弹窗 | 省份标签、城市玩法分类、真实玩法卡片和搜索；不再承担独立地区中转 |

## 修改文件

| 文件 | 修改内容 |
|---|---|
| `assets/Lobby/Code/Runtime/UnifiedPlaySelectorController.ts` | 真实目录渲染、四川默认筛选、分类文案、动态项触摸事件、权威 Schema 与建房链 |
| `assets/Lobby/Prefab/UnifiedPlaySelector.prefab` | 在用户授权范围内完成主界面和更多玩法弹窗原生布局；UUID 保持 `c865cc8c-6845-45d2-b275-2f776da30340` |
| `tests/unit/unified-create-room-ui.test.mjs` | 信息架构、可读性、分类职责和动态触摸门禁 |
| `server/Poker/src/main/java/com/aoo/bcg/poker/PokerCatalogRuntimeRegistry.java` | PDK Provider 与正式目录版本统一为 `1.0.0` |
| `server/Poker/src/test/java/com/aoo/bcg/poker/PokerRuleMatrixTest.java` | 发布 PDK Provider 版本契约测试 |
| `database/migrations/V20260826_08__publish_chengdu_pdk_catalog.sql` | 幂等发布成都 PDK 的 catalog/release/index/route、规则 Schema 和房费策略 |

未修改本任务外 UI，未执行背景资源方案，未触碰 `assets/Lobby/Prefab/uiGame-001/**` 或用户手动目录。

## 六段真实视觉证据

1. A 大厅“创建房间”入口：`evidence/123-a-lobby-create-room.png`
2. B 左玩法/右规则主界面：`evidence/123-b-approved-main-layout.png`
3. C 完整“更多玩法”弹窗：`evidence/123-c-more-games-popup.png`
4. C2 四川省 -> 内江玩法筛选和 NJPDK 卡片：`evidence/123-c2-neijiang-filter.png`
5. D 选择后的内江跑得快完整规则：`evidence/123-d-neijiang-njpdk-rules.png`
6. E 真实 PDK 房间 `100041`：`evidence/123-e-real-pdk-room.png`

全部截图来自最终 `build/web-mobile-unified-v9/index.html`，视口为 1280x720，操作使用真实画布点击，不是调用控制器函数或直接切换场景。

## 权威动态链证据

| 记录 | 房间 100041 结果 |
|---|---|
| Hall Room | gameId=629，classification=`CN-51`，playVersion=`legacy-equivalent-1`，state=`OPEN` |
| Member | accountId=154，seat=0，status=`JOINED` |
| RoomCreateSaga | step=`CONFIRMED`，attemptCount=0，无失败码 |
| Game Ticket | Gateway route 正确，`consumed_at` 非空 |
| Authority Route | node=`gateway-1`，fencing=1，lifecycle=`ACTIVE` |
| Trace | `bee04fb3-7b20-45d8-8dd9-3ca950b5ac6b` |

客户端未提交假 roomId，未 mock catalog/schema/create-room，未直接跳转游戏场景。

## 测试与构建

- 创建房间定向测试：14/14 通过。
- Poker 目录版本测试：12/12 通过。
- Hall/Gateway/Poker affected reactor：`BUILD SUCCESS`；Hall 13/13 通过。
- Client 全量：213 项中 212 通过；唯一失败是本任务外、用户保护的 PDK 手动目录和旧资源命名门禁，共 16 条。本任务相关测试全部通过。
- Creator 3.8.8 Web Mobile v9 已生成并用于上述真实点击。CLI 在产物完成后因受保护 `uiGame-001` 中既有缺失引用报告 exit 36；未修改该用户私有备份。

## Creator 同步边界

Creator 3.8.8 CLI 构建已执行 AssetDB 导入并由 v9 运行产物验证序列化结果。当前 Creator GUI 由其他 PDK 资源 owner 占用并存在其未保存资源，本轮没有擅自保存、关闭或覆盖该窗口；本任务 prefab 的磁盘 UUID、构建反序列化和运行实例均正常。

## 删除与冗余

本轮未新增第二套选择器、独立地区页面、旧地区入口、兼容路径、假数据或临时 UI。动态省市分类和玩法卡片统一由同一 `UnifiedPlaySelectorController` 渲染；创建入口仍唯一。

## 剩余状态

- 本次统一创建房间 UI、真实目录筛选、Schema 和建房入房闭环：完成，阻塞 0。
- 全项目外部 PDK 命名门禁：不属于本授权范围，且用户手动目录禁止擅改；需对应 owner 收口后复跑。
