# UI 自动测试

通过稳定节点 ID 点击真实 UI，检查按钮、弹窗、跳转、布局和资源显示。

大厅 V05 门禁：`node --test tests/ui/lobby-ui-v05.test.mjs`。夹具逐项登记
`NewMain.prefab` 的真实控件，并验证生产路由、请求期防重、加载终态、失败/空态、
返回与销毁清理。浏览器运行仍使用正式 Cocos 构建，不用 DOM 假页面替代 Canvas。
