# MsgDrift 连续提示真实 E2E

- 日期：2026-09-13
- Creator：3.8.8 Preview
- 地址：`http://127.0.0.1:7456/`
- 场景 UUID：`8d2a710a-63f6-4186-a17f-81339a64ef2c`
- Prefab UUID：`8c47209a-ef2a-4f47-9605-a363b4392d7c`
- 设备：Creator Preview Apple iPhone 14 Pro 横屏配置
- 操作：真实点击大厅“加入房间”，在空房间号状态下连续两次点击“确定”。
- 结果：两个物理点击各生成一条“请输入6位纯数字房间号”；第一条立即上滑，到顶停留后淡出，完全消失后第二条才从初始位置开始；队列结束后提示节点隐藏。
- 控制台：本次页面运行期错误数组为空。
- 网络/API/Hall/Game WebSocket：该验证仅触发客户端空输入校验，没有发起房间 API 或 WebSocket 请求，因此不产生 `roomId`、`operationId`、`stateVersion`。
- Build ID：Creator Preview 未暴露独立 Build ID；以场景 UUID、Prefab UUID 和本次 Preview 编译产物为版本证据。

关键帧：`first-sliding.png`、`first-fading-at-top.png`、`second-started.png`、`queue-finished.png`。
