# CI 分流与浏览器分组

2026-10-15 更新（#61 首批，基线 a2d716d）。流程入口为 [ci-pages.yml](../.github/workflows/ci-pages.yml)。前次 #54 基线 `5a11e3d`，纯文档 PR #51 的检查为 24 分 40 秒、合并后为 31 分 06 秒；当次构建任务只用 34 秒，主要时间在浏览器组内串行测试。

## 每次仍然执行的检查

PR、main push 和手动运行都执行纯规则/世界/存档单测、CI 策略测试、严格类型检查、构建和打包。重新生成的两份 HTML、两份 ZIP 和发布清单必须与提交一致。只构建一次，浏览器任务下载同一制品并校验 SHA-256。

`Build and test` 是保持名称不变的必需检查。它在依赖失败或跳过后也运行，只接受：

- 构建成功，策略要求浏览器，全部浏览器任务成功。
- 构建成功，策略证明可复用主线完整浏览器证据，浏览器矩阵按计划跳过。

策略为空、构建失败、测试失败、取消或意外跳过均不能通过。

## 纯文档快速通道

白名单为根目录 `README.md`、`AGENTS.md`、`CONTRIBUTING.md`、`handoff.md`、`.github/PULL_REQUEST_TEMPLATE.md`、`docs/` 内的 Markdown，以及已确认只作文学交接的 `docs/story/GEMINI-RETURN-MANIFEST-20261014.json`。必须是普通非可执行文件；符号链接和未知路径走全量。

`THIRD_PARTY_NOTICES.md` 嵌入 HTML，`README-游玩说明.txt` 进入便携 ZIP，`docs/release-manifest.json` 是制品依据，均不属于可跳过输入。代码、素材、测试、脚本、锁文件、配置和生成物也全部参与验证指纹。

快速通道同时要求：

1. PR 比较本次合成合并树与事件记录的 base 整体，不能只看最后一次文档提交；base 不可读则全量。
2. 从相同仓库、相同工作流最近 20 次成功 main 运行中，找到非文档树完全一致的记录。指纹包含每个文件的路径、类型、权限和 Git blob ID。
3. 该记录的构建、汇总、Pages 部署及当前八个浏览器组必须全部实际成功。此前跳过浏览器的文档运行不能作为下一次复用证据，也不复用 PR 的结果。
4. 新增的 Markdown 行内本地链接、文档 JSON 语法及 Git 空白检查通过。外部网址、标题锚点、引用式链接、事实和命令仍需人工审阅，历史损坏链接不被冒充为本次新问题。

没有匹配记录、API 超时/权限不足、返回截断、测试或工作流变化，均回退完整浏览器回归。手动 `workflow_dispatch` 始终完整运行，可用于环境更新后的主动复验。main 的判断以已完整验证的树为准，不能只比较 push.before；前一次代码运行被取消后追加文档仍须完整验证。

构建任务 Summary 和 `ci-selection` 制品记录决策、复用的 main 提交、运行链接和非文档指纹。记录里明确区分“本次实际执行”与“复用历史完整浏览器证据”。

## 八组分配

各组在独立 Ubuntu runner 上顺序执行，最多同时八组，`fail-fast: false` 保留其他组的失败诊断。当前完整保留 **37** 条浏览器命令，包括 #48 的商场样板、#57 的普通 2.5D 行动检查与 #56 的开场动画验收（约 20 秒，排在 batch-3）。没有拆分套件、减少断言、调整原浏览器参数或真实训练计时。

[scripts/ci/browser-suites.mjs](../scripts/ci/browser-suites.mjs) 是执行顺序和覆盖核对的清单；[run-browser.mjs](../scripts/ci/run-browser.mjs) 逐条执行原 `pnpm test:<id>`，因此 package.json 中的原参数（例如动画组过滤）仍生效。组合命令现在分开计时，存档检查在 batch-2 首个执行。旧客户端固定 HTML 在 batch-8 下载，随后由 expansion 校验并使用。

| 组 | 顺序执行的完整命令 |
| --- | --- |
| batch-1 | `test:browser`、`test:qol-expansion`、`test:station-tier2` |
| batch-2 | `test:save-browser`、`test:asset-load`、`test:hud-release`、`test:issue26-inventory` |
| batch-3 | `test:desktop-input`、`test:portable`、`test:shop-drag`、`test:title`、`test:title-water`、`test:opening` |
| batch-4 | `test:issue26-station`、`test:issue26-spatial`、`test:issue26-phaser-spatial`、`test:tactical`、`test:art` |
| batch-5 | `test:buildings`、`test:station-tier1`、`test:shop-feedback`、`test:mobile-ux` |
| batch-6 | `test:loot-target`、`test:mall-sample`、`test:qol`、`test:coast-render-targets` |
| batch-7 | `test:raid-default`、`test:ui`、`test:mall-landing`、`test:coast-animation`、`test:station-relief`、`test:station-reset` |
| batch-8 | `test:expansion`、`test:mobile`、`test:loot`、`test:mall-passages`、`test:systems` |

本轮按较慢运行样本重排，并将新增 raid-default 的实测 124 秒纳入负载。此前 35 套件的中位 17:33 和约 13–14 分钟调度回放仅为 #61 的研究输入；当前已经是 36 套件，实际收益必须使用同产品字节的新基线/候选对照，结果见承接 PR，不能把旧回放当成本次 CI 通过。

每组可在依赖和 Chromium 安装后用 `node scripts/ci/run-browser.mjs batch-2` 运行；batch-8 另需按工作流下载真实旧客户端。执行失败会立即停止本组后续套件并标记未运行，其他组照常完成。保留 45 分钟 job 超时，不额外缩短套件预算。

## 耗时与执行证据

每条套件开始和结束时写 JSON，记录组、套件 ID/命令、状态、退出码/信号、单调时钟耗时、run/attempt/SHA 及 Node、Playwright、对应 Chromium 构建元信息。Chromium 元信息来自已安装 Playwright 的浏览器清单，实际浏览器版本仍以原浏览器报告为准。不记录环境变量全集或凭据。

浏览器组 Summary 展示每条套件时长；`Build and test` 在原结果门禁之外下载并核对全部预期组和套件报告，再汇总耗时。缺报告、错误运行/提交、失败/中断、未执行/重复/遗漏套件及无效时长均不能放行。报告只代表完整套件的实际执行，不宣称本批已经完成每个 case 的新计时或分片清单；原测试报告仍保留。后续分片必须另验 case 全集、空选择及分片完整性。

这些耗时表不含 runner 排队、安装、构建或 Pages 等待；评估整条 CI 时用 Actions job/step 时间另行拆分，既报告触发到必需门禁的墙钟等待，也报告累计 runner 分钟。Pages 与镜像激活另计。

诊断制品 `browser-evidence-<group>-attempt-<n>` 和耗时制品 `browser-timing-<group>-attempt-<n>` 保留 14 天；构建制品仍保留 1 天。JSON 文件为 `<group>-attempt-<n>.json`，本地无 Actions 环境时使用 `local` 后缀。仅重跑失败任务时，汇总读取同一 run/SHA 下各组最新报告，允许保留之前成功组；最新失败不能退回旧成功，未知文件或未来 attempt 拒绝通过。原 GitHub job 结果门禁同时生效。失败或取消不能被计成成功，首败与重跑结果分列。八组只限制一次矩阵的并行度，多个 PR 可同时各用八台，记录并发与排队影响。

增加浏览器测试时更新 package.json、套件清单、覆盖测试和本表。工作流矩阵必须与清单一致；修改组名会改变主线证据要求。工作流/清单/测试属于非文档指纹，因此新策略 PR 和首次 main 必须全量执行；完整 main 通过后文档快速通道才能复用新证据。旧客户端下载必须随消费者迁组，新增输出目录不得覆盖其他报告。

## Pages 与镜像

main 即便走文档快速通道，也从本次重新构建并校验的制品正常执行 `Deploy Pages`。相同游戏字节已有完整 main 回归证据，本次单测、构建与制品一致性仍需通过。

这样保留镜像对 `Build and test`、`Deploy Pages` 的成功要求及固定提交/清单/实际 Pages 字节一致校验，不需要修改服务器脚本或部署权限。PR 不部署，main 新代码必须完整回归；浏览器首次采用本策略的 PR 和合并后主线都需要全量通过。

## 本次未改变的验收

真实 120 秒训练、存档写入失败回滚、多窗口冲突、旧档兼容和离线检查保持原样。没有以缩短等待、改阈值或自动重试掩盖失败。PR 结果复用、录像/渲染优化、缓存优化留待实际耗时和失败证据支持后再做。
