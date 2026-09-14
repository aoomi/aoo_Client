# 112 大厅客服能力配置整改

日期：2026-08-25

## 结论

大厅启动不再把可选的客服服务 URL 当作必填配置。客服能力由公开运行配置
`supportEnabled` 显式控制：

- `false` 或未配置：大厅正常启动，点击客服入口显示“客服服务在当前环境未启用”，不发起网络请求。
- `true`：必须同时提供真实 `supportHttpUrl`；缺失时立即拒绝错误配置，禁止假 URL 和静默降级。

## 根因

`AooLobbyBridge` 构造阶段无条件要求 `supportHttpUrl`，但正式本地服务拓扑没有启用
Support 服务。一个可选业务能力因此阻断了整个大厅创建。

## 修改

- `assets/Common/Code/Runtime/config/RuntimeEndpoints.ts`：声明 `supportEnabled`。
- `assets/Lobby/Code/Runtime/AooLobbyBridge.ts`：按能力开关装配真实 Support 客户端或显式禁用能力。
- `tests/unit/legacy-lobby-production-bridge.test.mjs`：增加启动不阻断、启用时缺 URL 必须失败、禁用文案检查。

未修改任何 scene、prefab、meta 或 LoginScene 布局，无 Creator AssetDB 同步项。

## 自动验证

- `node --test tests/unit/legacy-lobby-production-bridge.test.mjs`：6/6 通过。
- `bash scripts/verify-build.sh`：164/164 通过，TypeScript 与 Creator 资源门禁通过。

## 网页验证边界

Codex 内置浏览器在当前机器报告不支持 WebGL，外部 Chrome/Edge 未连接，因此未把无渲染环境冒充
Creator 网页验收。用户在 Creator 预览刷新后应验证：登录进入大厅不再出现
`supportHttpUrl is required for the production lobby`；当前本地配置点击客服显示明确禁用状态。
