# 队长添加输入框真实验收

- 日期：2026-09-15（Asia/Shanghai）
- Preview：`http://127.0.0.1:7456`
- 浏览器：任务专属无头 Chrome，CDP `1234`
- 测试账号：`31`，亲友圈：`549245`
- 真实路径：亲友圈主界面 → 队长 → 添加队长 → 输入框 → 公共数字键盘 → 输入 `581` → 确定 → 搜索。
- 修复前：点击输入框无任何响应，见 `01-before-input-click.png`。
- 修复后：点击打开唯一公共 `Numpad`，见 `02-common-numpad-open.png`；输入值见 `03-id-entered-on-numpad.png`；搜索返回玩家 `581`，见 `04-search-result.png`。
- 关键日志：`[ClubPromotion] add-search-start { clubId: 549245, pid: 581, level: true, protocol: club.CClubPromotionLevelPidInfo }`；`[ClubPromotion] add-search-success { clubId: 549245, pid: 581, level: true, sign: true }`。
- 运行结果：`pageerror=[]`；未点击“添加合伙人”，没有改变玩家身份、亲友圈成员或队长关系。
- 定向门禁：`tests/ui/numeric-button-prefab-contract.test.mjs`，`2/2` 通过。
- TypeScript：本次修改文件无新增错误；全项目检查仍有 8 个既有 PDK 类型错误，均不在本任务范围。
- Creator 同步：Cocos Creator 3.8.8 执行“项目 → 刷新预览”；最终 Preview 分块已包含 `UIClubPromoterLevelAdd/EditBox` 和新增 `[ClubPromotion]` 日志。
