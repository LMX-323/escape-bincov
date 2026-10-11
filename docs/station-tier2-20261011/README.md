# PR #35：可信训练进度与补给拒绝反馈

2026-10-11，新加坡时间。继续 `D:/bincov/ai-tier2-station` / `fix/ai-tier2-station` 的原 [PR #35](https://github.com/xuys2025/escape-bincov/pull/35)，仅承接 [#32](https://github.com/xuys2025/escape-bincov/issues/32) 的 API-02 / API-03。[原验收范围](../AI-LEFTOVERS-TIER2A.md)。接手 fetch 后 main 为 `6494b51ab987cd9fe038604afdf0caf8a1bc8d75`，原 PR head `8c24ac3d2c6082cb5ea940f2074b07d3de1c4ee8`，工作区干净。当前 agent 独立实现与验证，没有派工。

## 实现与接口含义

`RealHideoutRuntime.trainingProgress()` 返回独立、只读的有效视图。`base.training` 和身体成长快照仍只表示已提交会话，存档格式和训练规则不变。

| 字段 | 含义 |
| --- | --- |
| `saved.activeSeconds / quantity` | 原档中已提交的本轮余数、十分钟共享训练量 |
| `pendingSeconds` | 上次提交后，原 `B.practice` 实际接受的有效秒数；包含跨收益点的秒数，不能直接和已保存余数相加作为本轮进度 |
| `activeSeconds / quantity` | 在副本上按原规则应用已验证样本后的余数和训练量；保存失败时只读保留候选，不再次应用样本 |
| `pendingGrowth` | 候选中尚未写入的成长差量，不代表已获得奖励 |
| `windowLeft / windowExpired / pendingWindow` | 有效候选窗口剩余时间、是否已到期、下一次有效移动开启的新窗口是否待保存；读取不重置窗口 |
| `capped / status` | 原共享上限，以及设施/属性选择/存储/冲突/过期候选/入口锁定状态 |

进度环、训练提示和设施面板统一读取该接口，删除宿主的本地累加和 `pendingSeconds` 回调。界面分别显示已保存、待保存；成长提示仍只由持久化成功事件触发。外部 revision 改变后，旧样本不能套进新状态；失败候选仍单独保留供备份，失效候选不能重放。刷新只恢复实际档案，切换属性及院子/页签仍经过原提交入口。120 秒收益、十分钟共享 1 点训练量、位置/速度/时钟校验和五秒检查点沿用原规则。

`useRpgItemResult()` 共用原效果应用与真实变化判定，原 `useRpgItem()` 继续返回 boolean；Runtime 分别返回 `missing-item`、`not-supply`、`no-effect`，院子沿用原提示展示。水分满仍可补耐力/减污染；饱食满仍可补生命/耐力；生命满仍可止血。持续效果仍按原续时及幸运效果替换规则。规则拒绝不消费、不写入；有效使用仍由单事务保存成功后提交，失败回滚，重试不会偷偷再次使用。冲突、存储故障和入口锁定优先级保留。仅为本批提示可读性修正原 toast 层级及窄屏居中，未重设计界面。

新增 9 项单元边界测试及 15 项 `test:station-tier2` 浏览器专项，专项加入 CI world 组。新增中文提示的三个字按原固定字体源和工具重建字库，许可不变；两个 HTML、ZIP 和发布清单由 `pnpm package` 生成。

## 实际验证

Windows，Node 24.19.0，pnpm 11.19.0，项目锁定 Chromium 153.0.8010.12。离线正式 HTML 的真实 Runtime、SaveSession、localStorage 和 DOM 控件；没有原型替身。夹具只通过显式 `?test=1` 在院子关闭期间写入，故障用配额注入。390×844 是视口/触屏仿真，训练动作使用键盘输入；失焦/隐藏是门控仿真，不能冒充手机或实际系统切窗。普通离线入口没有测试全局。

最终 HTML SHA256：`390b244716803312987f5c53f7b08b2188c2a935b9b7ee8fa5b0bc374cbcc71c`，两个入口逐字节相同；[完整制品清单](../release-manifest.json)。

| 命令 / 检查 | 实际结果与证据 |
| --- | --- |
| `pnpm test` | 287/287；[原始日志](evidence/unit-final.txt) |
| `pnpm package` | 严格类型、完整字库、离线 HTML/ZIP 通过；[日志](evidence/package-final.txt) |
| 首轮本地 `pnpm test:station-tier2` | 15/15，页面错误和外部请求均 0；[原始报告](evidence/final/tier2-browser.json)、[日志](evidence/browser-final.txt) |
| CI 修正后完整专项 | 15/15，页面错误与外部请求均 0；[报告](evidence/revised/browser.json)、[日志](evidence/revised/browser.txt)，包括完整合法 peer 及实际接受样本精确对照 |
| 8 倍 CPU 节流边界复核 | 三尺寸进度和保存候选四项全过；[报告](evidence/revised/slow-cpu.json)、[日志](evidence/revised/slow-cpu.txt)。1920×1080 实际接受 12/36 个样本，0.4516 秒与视图精确相等 |
| 真实时钟收益 | 初轮 1280×720 为 132.331 秒；修正后 640×360 辅助视口为 132.255 秒，均完成 120 秒有效训练、技巧成长 0.0525；站立、打开面板、隐藏/失焦门控均无新增训练；没有加速 Date，完整 trace 在专项报告 |
| 原构建负对照 | 五项适用产品断言全部预期失败，页面错误 0；[原报告](evidence/baseline-control/report.json)、[日志](evidence/baseline-control/output.txt)及五张失败截图。检出旧环错误增长、上限显示及三尺寸笼统补给反馈；没有用缺少新 API 的崩溃充数 |
| 完整有效 peer 复核 | 多窗口夹具显式通过严格 `decodeSession`，新档 revision/现金真实改变，冲突优先且保留新字节；[定向报告](evidence/final/valid-peer.json)、[日志](evidence/valid-peer.txt)。首次专项的 peer 附加了未知 writer 字段，只能证明拒绝外部字节；最终脚本移除该字段并加强合法性断言 |
| 受影响旧回归 | 最终结果见下方回归清单；只记录实际完成项 |
| 最终 head 完整 CI | 以 [PR #35 检查](https://github.com/xuys2025/escape-bincov/pull/35/checks)为准；全部必要组及 `Build and test` 成功后才转 Ready；PR 不部署 Pages |

专项覆盖准确的不足五秒待保存读数、拒绝时钟样本、原上限、重复读取、120 秒临界点配额失败/候选备份/单次重试奖励、三种补给拒绝、每种复合补给的有效对照、持续效果、供给回滚、真实 peer storage 冲突，以及旧页签补给和院子/刷新持久化语义。单元另覆盖池内/区外/速度/站立/悬挂输入、属性切换、窗口到期、外部 revision 及失效候选。

完整受影响回归均已实际执行。首次批量运行的原始退出码保留在[首轮清单](evidence/regression-first-summary.json)，其中院子文案断言失败；修正后完整重跑 76 项，结果单独保留在[最终院子清单](evidence/station-final-summary.json)，未覆盖首败。

| 原有命令 | 最终结果 | 证据 |
| --- | --- | --- |
| `pnpm test:hideout` | 8/8 | [报告](evidence/final/hideout.json)、[日志](evidence/test-hideout.txt) |
| `pnpm test:station` | 76/76；页面错误、外部请求均 0 | [报告](evidence/final/station-browser.json)、[重跑日志](evidence/test-station-final.txt) |
| `pnpm test:save-browser` | 9/9 | [报告](evidence/final/save-browser.json)、[日志](evidence/test-save-browser.txt) |
| `pnpm test:systems` | 16/16 | [报告](evidence/final/systems.json)、[日志](evidence/test-systems.txt) |
| `pnpm test:station-tier1` | 10/10 | [报告](evidence/final/tier1-browser.json)、[日志](evidence/test-station-tier1.txt) |
| `pnpm test:portable` | PASS；实际 ZIP 解压、`file://` 离线入口，临时目录已清理 | [报告](evidence/final/portable.json)、[日志](evidence/test-portable.txt) |
| `pnpm test:ui` | PASS | [报告](evidence/final/ui.json)、[日志](evidence/test-ui.txt) |
| `pnpm test:browser` | PASS | [报告](evidence/final/browser.json)、[日志](evidence/test-browser.txt) |
| `pnpm test:desktop-input` | PASS | [报告](evidence/final/desktop-input.json)、[日志](evidence/test-desktop-input.txt) |
| `pnpm test:mobile` | 10/10（触屏仿真） | [报告](evidence/final/mobile.json)、[日志](evidence/test-mobile.txt) |
| `pnpm test:mobile-ux` | 11/11（触屏仿真） | [报告](evidence/final/mobile-ux.json)、[日志](evidence/test-mobile-ux.txt) |

## 真实截图

以下均为最终正式构建实际画面，使用明确的设施/补给存档夹具。测试没有改写 DOM 读数、模拟奖励或替换 Runtime。

| 视口 | 院子进度 | 设施读数 | 补给拒绝 |
| --- | --- | --- | --- |
| 1280×720 | [院子](evidence/revised/training-yard-1280x720.png) | [设施](evidence/revised/training-panel-1280x720.png) | [实际原因](evidence/revised/supply-no-effect-1280x720.png) |
| 1920×1080 | [院子](evidence/revised/training-yard-1920x1080.png) | [设施](evidence/revised/training-panel-1920x1080.png) | [实际原因](evidence/revised/supply-no-effect-1920x1080.png) |
| 390×844 仿真 | [院子](evidence/revised/training-yard-390x844.png) | [设施](evidence/revised/training-panel-390x844.png) | [实际原因](evidence/revised/supply-no-effect-390x844.png) |

另见[上限等待](evidence/revised/cap-wait-1280.png)、[训练保存失败](evidence/revised/training-quota-before-retry.png)、[保存重试后](evidence/revised/training-quota-after-retry.png)、[初轮 1280×720 真实收益点](evidence/final/training-real-120-credit.png)及[修正后 640×360 辅助收益截图](evidence/revised/training-real-120-credit.png)。后者显示实际成长提示，短视口的面板下部在画面之外，不作为完整面板布局证据。三种产品视口的关键文本按当前 DOM 帧检查视口边界、裁切和动画透明度，并已目视检查。

## 首败与修正

所有首败均保留，没有覆盖为后续 PASS。

1. [首轮单元](evidence/failures/unit-first.txt) 41/42：已保存状态的成长差量因算式顺序出现 `2.08e-16`，改为各分量先做差，使无候选状态精确返回 0；没有放宽断言。
2. [首次打包](evidence/failures/package-first.txt) 检出「属毒饮」缺字。按仓库固定源哈希及 fonttools 4.61.1 / brotli 1.2.0 重建；[第二次打包日志](evidence/failures/package-second.txt)保留。Windows 默认 GBK 导致字体脚本写字符表失败，使用 Python `-X utf8` 重新生成后通过，没有跳过字库门禁。
3. [第一轮](evidence/failures/first-report.json)、[第二轮](evidence/failures/second-report.json)浏览器夹具把安全箱写成 3×2，被原严格校验拒绝；修成原 2×2，并保留正式 expansion 版本字段。两轮日志与[首张拒绝截图](evidence/failures/first-fixture-rejection.png)保留；这不是产品负对照。
4. [第三轮](evidence/failures/third-report.json) 14/15：窄屏长补给反馈沿用 `left:30%`，可读性检查超时；原提示在面板之后的绘制层级也需明确。改现有窄屏居中和 toast 层级，等待自身动画结束后测量/截图，原尺寸与裁切断言保留。[第三轮日志](evidence/failures/browser-third.txt)、[超时后截图](evidence/failures/third-narrow-after-timeout.png)保留；后者提示已消失，不冒充即时裁切证据。最终完整专项 15/15，最终截图文字完整可读。
5. 原 `test:station` 首次 75/76，唯一 C2 仍要求旧「操作未完成」文案，实际已返回本批要求的具体原因。改为精确校验罐头拒绝原因，原身体/库存/存档不变断言全部保留，完整重跑结果列于最终回归表；[首轮报告](evidence/failures/station-first/report.json)、[日志](evidence/failures/station-first/test-station.txt)与[截图](evidence/failures/station-first/fail-9.png)保留。
6. 首个实现提交 `5beee4b` 的 [CI 38140656823](https://github.com/xuys2025/escape-bincov/actions/runs/38140656823) 失败：world 中专项 10/15，构建及其余三组通过，汇总失败、部署跳过。[专项原报告](evidence/failures/ci-first/report.json)、[原日志](evidence/failures/ci-first/failed-jobs.txt)、[完整 CI 快照](evidence/failures/ci-first/run.json)和五张失败截图均保留。宿主原来每帧只提交至多 0.05 秒，低帧率 CI 在固定墙钟内不能保证超过 0.5/1 秒待保存，也没有在初设 210 秒预算内得到 120 秒有效训练；181 秒时实际保存 37.9 秒、待保存 1.0 秒。没有为此改变宿主限时、奖励或存档规则。
7. 首次 8 倍 CPU 节流复核又检出“所有位置合法输入都被接受”的假设错误：[观察器首败](evidence/failures/observer-first/report.json)、[日志](evidence/failures/observer-first/log.txt)、[截图](evidence/failures/observer-first/fail-1.png)。修正后的测试只观察原 Runtime 样本队列长度来记录真正接受的样本，不修改样本/队列，原 `practice` 每次收到原样参数且只执行一次。三个尺寸与失败候选都精确校验待保存秒数等于已接受样本总和，而不是放宽成任意进度；[节流最终报告](evidence/revised/slow-cpu.json)、[日志](evidence/revised/slow-cpu.txt)四项全部通过。候选夹具改为保存 119.95 秒，仍必须真实越过 120 秒、保留候选/备份且重试只发一次奖励。

完整真实时钟专项增加 640×360 辅助视口以降低软件光栅化成本，并将墙钟预算设为 540 秒；所有计时仍是真实时钟，断言仍要求原 120 秒有效训练、0.2625 训练量与 0.0525 成长。此辅助视口不替代前述 1280×720、1920×1080、390×844 的实际画面验证，也不代表低帧率原生设备的性能验证。源码及两个 HTML 的字节未因 CI 修正改变。

修正后的完整本地专项再次 15/15；[三尺寸院子与面板、补给、保存重试和真实收益的本轮截图](evidence/revised/browser.json)均与本轮报告同目录保留，初轮截图没有覆盖。最终 CI 必须以追加修正提交的完整检查为准，首个失败 CI 不代表通过。

## 交接与保留边界

两项在原 PR 交回主调度，合并前 #32 对应项标「待合并」，总 issue 开放。最终提交、完整 CI 和 Ready 状态见 PR。提交与经 7897 代理推送保留本地密钥检查及原钩子。未改存档格式、主档键、规则数值、地图、人物/场景素材或发布流程；没有合并、发布或更新试玩站。

真手机、Safari/Firefox、真人手感、原生 GPU/驱动等未测；历史 F20 PARTIAL、ASTRA-SAVE-01 UNCONFIRMED 和其它二三级事项仍按 #32 保留。本批不新增三组 60 轮内存门槛、不做救济或商店新规则，交回后停止。
