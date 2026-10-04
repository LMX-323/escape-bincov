# 《逃离滨科夫》0.1.1 交接记录

更新：2026-10-04。权威仓库：https://github.com/xuys2025/escape-bincov 。公开发布后以仓库最新 `main` 为基线；所有后续任务先读 `AGENTS.md` 和 `docs/AGENT-HANDBOOK.md`，通过独立分支与 PR 交付。

## 2026-10-04 移动端适配计划

以 UI 精修合并后的 `f4c50bdf1ae7cd6a1c1309ea77aa765169ac4b6b` 为基线，在 `docs/mobile-adaptation-2026` 分支编写 [docs/MOBILE-ADAPTATION-PLAN.md](docs/MOBILE-ADAPTATION-PLAN.md)。本轮只有计划、README 文档导航与交接记录，不改变游戏源码、存档、构建产物或当前手机支持声明。

计划面向 2026 年仍在使用的 iPhone、Android 中端/大屏和鸿蒙手机，提出横屏战斗、横竖屏整备、独立触控层、点击式库存、后台恢复和真机性能验收；拆为 M0–M5 六个阶段，工程估算 10–14 个工作日，真机借测及评审等待另算。来源采用厂商规格、Phaser、MDN 与 WebKit 文档；硬件规格不等于本游戏兼容性。

本轮验证为源码事实、相对链接、资料来源与 Markdown 差异检查；本地未重跑游戏测试或打包，因为只有文档改动。PR 的自动 CI 结果以 Actions 为准。移动端代码、真机多指/音频/文件测试、热衰减和大陆三网测试均尚未开展。下一步从 M0 测量与输入原型开始，按阶段提交独立 PR，不得将本计划标为已实现。

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
