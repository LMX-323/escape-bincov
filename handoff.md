# 《逃离滨科夫》0.1.1 交接记录

更新：2026-10-04。权威仓库：https://github.com/xuys2025/escape-bincov 。公开发布后以仓库最新 `main` 为基线；所有后续任务先读 `AGENTS.md` 和 `docs/AGENT-HANDBOOK.md`，通过独立分支与 PR 交付。

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
