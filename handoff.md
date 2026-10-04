# 《逃离滨科夫》0.1.1 交接记录

更新：2026-10-04。权威仓库：https://github.com/xuys2025/escape-bincov 。公开发布后以仓库最新 `main` 为基线；所有后续任务先读 `AGENTS.md` 和 `docs/AGENT-HANDBOOK.md`，通过独立分支与 PR 交付。

## 2026-10-04 应用状态与存档会话重构

基线 `f4c50bdf1ae7cd6a1c1309ea77aa765169ac4b6b`，独立分支 `agent/core-foundation-refactor`。抽出 `src/app.ts` 组装共享状态，以及不依赖 DOM/Phaser 的 `src/session.ts`，统一出击、物品事务、结算重试、导入、救济、音量和冲突状态。UI 保留模板、交互、提示及场景切换；出击候选先写入再发布，物品事务在拒绝、异常和存储失败时恢复存档、负载及生命状态。

存档键/格式、备份版本、领域与战斗规则、地图、样式和美术均未改变，没有新增依赖或运行时网络请求。对比基线的 23 个 UI 模板字面量完全一致；HTML 增加 1,318 字节（约 0.08%）。两份 HTML、两个 ZIP 和 `docs/release-manifest.json` 已重新打包，内容、CRC、字节数及 SHA-256 核对通过。后续扩展示例见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，开发手册的源码地图已同步。

本地实际验证（Linux x64、Node 24.19.0、pnpm 11.25.0、Playwright 1.63.0、Chromium 138.0.7204.0 / SwiftShader）：

| 检查 | 结果 |
| --- | --- |
| `pnpm test` | 59/59，通过；新增 12 项无 DOM 的会话测试，保留原 UI 流程测试 |
| `pnpm package` | 通过，包含严格 TypeScript 检查 |
| `pnpm test:browser` | 24/24，通过；1280×720 和 1920×1080 |
| `pnpm test:ui` | 38/38，通过；两种分辨率截图，人工抽查整备、站内设置及待保存弹窗 |
| `pnpm test:save-browser` | 9/9，通过；新增失败出击及真实同源双窗口冲突/备份 |
| `pnpm test:portable` | 6/6，通过；解压后普通入口离线操作，无测试接口/外部资源请求 |
| 文档链接、模板对比、制品哈希、`git diff --check` | 通过 |

环境说明：`pnpm exec playwright install chromium` 的 CDN 下载在此环境返回无效 ZIP，改用已可用的 Chromium，通过既有 `BINCOV_CHROME`/`BINCOV_CHROME_ARGS` 配置执行；未修改断言或仓库依赖。项目及 CI 的 pnpm 版本仍固定为 11.19.0。本地诊断和截图在忽略的 `test-results/`；PR 的 CI 会重新生成可下载报告，以对应 Actions 结果为准。

未运行十分钟 `test:play`、手机真机及大陆网络实测；本次没有修改战斗、AI、潮汐、持续负载或输入规则。当前没有发现阻塞回归。输入/战斗/HUD 仍在 `game.ts`，UI 模板与事件仍在 `ui.ts`，后续按具体需求分步拆分。按 PR 交付，未合并或更新正式 Pages。

## 2026-10-04 界面精修

基线 `a0345e8df55c9ea50b2985b0ba549be38bc676c6`，独立分支 `agent/ui-polish`。保留暗绿像素场景与原有玩法，统一整备导航、物品格、详情面板、交易行、任务进度、站内设置、HUD 和弹窗。主要修正物品名称/数量重叠、长内容与出击底栏挤压，以及重复装饰标题占据操作区域的问题。

新增 `pnpm test:ui` 并纳入 CI：两种分辨率共 38 个界面场景；同时验证名称/数量不重叠、扩建仓库末行可操作、工作区与底栏分离、键盘选择及任务进度。47 项基础测试、24 步浏览器流程、7 项存档专项和 6 项离线包检查全部通过。没有改动领域规则、世界、美术、战斗或存档格式，未重跑长时间自动玩家平衡测试。

图文对照、环境与边界见 [docs/UI-POLISH.md](docs/UI-POLISH.md)，本轮报告位于 `docs/ui/`；原 `docs/ACCEPTANCE.md` 保留历史完整循环验收记录。两份 HTML、两个 ZIP 及哈希清单已重新生成。本轮按 PR 交付，需维护者合并后由 CI 更新 Pages。

## 交付

- 根目录 `start the game.html`：完整便携游戏。
- `dist/index.html`：与根目录启动文件一致，可供静态托管。
- `release/Escape-Bincov-portable.zip`：游戏 HTML 与中文说明。
- `release/Escape-Bincov-web.zip`：根目录为 index.html 的网页上传包。
- `docs/ONLINE-CHINA.md`：大陆网络下的托管选择、预览链接限制、域名与存档迁移步骤。

源码包保留完整 Git 历史，不携带 node_modules、包缓存和临时测试输出；用 `pnpm install --frozen-lockfile` 恢复开发依赖。历史源码包顶层目录名为 `Eascape from Bincov`；公开仓库目录为 `escape-bincov`。旧 ZIP 不再作为后续开发基线。

## 本次变更

1. 结算先写入候选存档，成功后才进入结果页。失败时锁定行动，保留 pendingSettlement，提供重试和结算备份。重复结算和另一窗口写入不能覆盖待保存结果。
2. 购买、任务、库存拖放、安全箱、医疗物品使用等保存失败时恢复库存、现金和相应生命状态；物品丢到世界延后至保存成功后执行。
3. 新增严格校验的 JSON 备份，包含完整已结算进度。导入确认并成功写入后才替换本地状态。
4. HUD 在面板重绘后立即恢复实际数值，修复暂停时显示 10:00 的问题。
5. 补齐主目录入口，便携和网页 ZIP 随 pnpm package 一起生成，版本升至 0.1.1。
6. 测试命令使用 node --import tsx，避免部分环境中 tsx CLI 的命名管道限制；浏览器路径支持跨平台，便携 ZIP 检查在非 Windows 使用 Python 3。

## 验证

完整证据见 `docs/ACCEPTANCE.md`：47 项自动测试、24 步双分辨率浏览器回归、7 项存档专项、6 项便携测试、超过 10 分钟真实计时自动流程。最终制品大小与哈希见 `docs/release-manifest.json`。

## 后续

本轮将项目迁入公开 GitHub 仓库，增加真实截图 README、Agent 协作规范、PR 模板、CODEOWNERS、CI 与 GitHub Pages 自动发布；菜单增加仓库跳转，打包改为固定 ZIP 时间戳并自动生成制品哈希。试玩入口：https://xuys2025.github.io/escape-bincov/ 。部署状态以仓库 Actions 为准；大陆三网尚未实测，EdgeOne 镜像尚未部署。当前只支持桌面键鼠单人游戏。下一轮玩法工作应依据真人试玩反馈；自动玩家已能清空本局固定敌人，后半局持续目标与威胁可作为设计讨论项。
