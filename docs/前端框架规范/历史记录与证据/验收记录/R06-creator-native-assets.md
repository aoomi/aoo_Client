# R06｜Creator 3.8.8 原生场景与资源审计

验证时间：2026-08-24  
范围：Client 场景、Prefab、资源元数据、资源加载与 Creator 专属门禁

## 整改

- 全量扫描 1,626 个 `.scene`/`.prefab`、25,332 个资产/元数据文件与 33,649 个 UUID；原生对象数组、`__id__`、节点父子关系、组件归属/重复、Prefab 循环、超大数值缓冲、不可见点击拦截、Meta 配对与 UUID 唯一性均为 blocking=0。
- LoginScene 删除 Creator 新建节点验证残留及无子节点、无脚本引用、仅含 UITransform 的空 `Login/bj` 遗留，保留业务账号入口 `btn_mobile` 与唯一账号面板 `mobile`；面板内通用名字改为 `AccountLoginBackdrop`、`AccountLoginTitle`。
- 固化 `Login/user agreement/toggle` 与 `Login/user agreement/btn_user_agree`；Toggle 原生组件可解析，未恢复旧登录结构。
- 将 `gametype.json` 与 `selectCity.json` 连同原 UUID 元数据迁入 `resources/legacy-data`，修复 Club 运行时的字面量动态加载地址，未复制或伪造业务数据。
- 新增 `scripts/verify-creator-native-assets.mjs` 及对应 Node 测试；`verify-creator-node-creation` 是只读门禁，检查测试节点残留、账号面板唯一性、协议层级与现有组件解析，不写回场景。

## 验证结果

- 严格 TypeScript 与 Client 全套测试：84/84 通过。
- Creator 原生资源门禁：1,626 个序列化资产、25,332 个资产/Meta、33,649 个 UUID，blocking=0。
- 组件注册门禁：38 个 ccclass、33,649 个 UUID，通过。
- Creator 节点创建门禁：149 个对象、38 个节点，通过。
- AooClientManager 隔离门禁：5/5 通过；未恢复静态节点、废弃属性或旧 UUID。
- Cocos Creator 3.8.8 全量导入及 web-desktop 构建：通过，22 秒。
- 87 完整隔离门禁：25,340 个文件、57,289 条证据、blocking=0、passed=true；门禁单测 7/7 通过。

Creator 构建进程完成后生成的用户级 `window.json` 已重新校验为合法 JSON；场景导入、脚本编译、资源打包和构建均未出现 unresolved module 或缺失序列化 UUID。

LoginScene 当前缺少代码绑定所需的 `Login/btn_wechat_login`。依据登录界面强制只读规范，标记为“待用户在 Creator 中处理”；AI 未新增按钮、组件、坐标、图片或布局。

## 审计边界说明

代码树另有两个运行时字面量目标 `A3PKPlay.prefab` 与 `UIAYDSSPlay.prefab`，当前资产库及 2.22 只读证据树均不存在对应真实业务资源。R06 未生成占位 Prefab、未改写玩法路由，也未以删除调用掩盖缺失；这两项需要真实美术源资产才能闭合动态加载专项，不能计入上述“序列化原生资产 blocking=0”。
