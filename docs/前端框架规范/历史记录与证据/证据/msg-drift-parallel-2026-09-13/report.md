# MsgDrift 并发提示真实 E2E

- 日期：2026-09-13
- Creator：3.8.8 Preview
- 地址：`http://127.0.0.1:7456/`
- 操作：真实点击大厅“加入房间”，空房间号状态下连续点击两次“确定”。
- 结果：每次点击均立即创建独立提示实例；第二条出现时第一条仍在上滑，两条同时可见、互不覆盖动画状态，也不等待前一条消失。
- 动画：0 秒初始停顿，上滑完成后停留 0.5 秒，再独立淡出销毁。
- 运行期错误：空。
- 网络说明：本用例属于客户端空输入校验，不产生房间 API、WebSocket、`roomId`、`operationId` 或 `stateVersion`。

证据：`two-visible-in-parallel.png`；`two-rapid-clicks-immediate.png` 记录 80ms 间隔的连续触发即时响应。
