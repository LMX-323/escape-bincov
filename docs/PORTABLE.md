# 0.1.1 便携包与网页包验证

2026-10-04，Linux 上的 Chromium 138.0.7204.0 完成 6 项便携检查，全部通过。

- `release/Escape-Bincov-portable.zip`：内含完整游戏 `start the game.html` 和中文游玩说明。
- `release/Escape-Bincov-web.zip`：根目录只有 `index.html`，可直接交给静态网站托管平台。
- 两个 ZIP 均通过 CRC 完整性检查，内部 HTML 与主目录入口及 `dist/index.html` 逐字节一致。
- 便携测试实际解压到新建的中文与空格目录，通过正常入口离线启动；无测试接口、外部网络请求或其他本地资源请求。
- 验证进入水产站、真实倒计时、真实射击弹药 8→7、Tab 背包、Esc 暂停；暂停时 HUD 保持真实剩余时间。
- 当前构建大小与 SHA-256 见 `release-manifest.json`；测试详情见 `portable-report.json`。

执行 `pnpm package` 会同步两个启动 HTML 并生成两个 ZIP。`pnpm test:portable` 使用独立浏览器上下文；Windows 使用 .NET ZIP API，Linux/macOS 使用 Python 3。可通过 `BINCOV_CHROME` 指定浏览器。
