# #60 · 代码理解成本与状态投影收敛

- 任务：[质量与减熵计划 #60](https://github.com/xuys2025/escape-bincov/issues/60)。分支 `agent/quality-entropy`；该任务的实施记录链接承接 PR，最新 head/检查以 PR 为准。
- 开始基线：`773dcdf37c69c9441f7687627b89b582087eb021`；2026-10-15 普通合并同步已接受 main `a2d716da774d7c5b17a2bbdf7bef4ee0eecc4742`（#57），保留双方历史。首批实现提交 `e50f49a`，整合与类型补强随本 PR 提交。
- 当前目标：低上下文 AI 按任务定位代码，关键状态约束靠近接口；两套行动宿主共享等价的持久化投影。
- 完成边界：导航/契约与真实调用一致，历史按需可追溯；共享投影通过旧/新宿主、存档和失败恢复验证；必要生成物一致，PR CI 通过。

## 有效决定与协作边界

1. 当前规则由源码和测试说明；导航索引符号、调用关系和条件扩展，不新建全仓符号/命令副本。
2. live、最近提交记录和失败候选分角色保留。先抽纯字段关系，不改变事务发布、时钟/RNG、世界/存档版本或渲染生命周期。
3. #57 默认 2.5D 已合并并纳入本次验证；#56 开场仍由原 PR 承接，本次未纳入。在继续工作前重新核对最新 main，不把在途实现写成已接受事实。更深的 codec/路由/命令登记等阶段继续由 #60 跟踪。

## 修改入口

- [CODEMAP](../CODEMAP.md)：三个任务阅读路径和模块卡；[架构](../ARCHITECTURE.md)：当前状态角色与依赖。
- [Session](../../src/session.ts)：`persist`、候选 prepare/commit 的现行契约。
- [旧行动宿主（#64 已删除，链接为删除前版本）](https://github.com/xuys2025/escape-bincov/blob/225248b1aa21f326b9057dfa393b3eb61f3c9b11/src/game.ts)与 [Runtime](../../src/raid-runtime/runtime.ts)：捕获/恢复接入与表现生命周期。
- [开发手册](../AGENT-HANDBOOK.md)与[短交接模板](../TASK-HANDOFF-TEMPLATE.md)：按风险验证与续作。

## 实际验证

以下为整合 `a2d716d` 后本分支的本地结果；GitHub CI 在提交后运行，以承接 PR 的准确 head 为准。环境为 Windows、Node 24.21.0、pnpm 11.19.0、Chrome/Playwright 离线上下文。

| 检查 | 状态 |
| --- | --- |
| 导航链接、符号、陈述 | 独立接手复核通过；已补初始化/旧检查点入口，按 #57 更新执行器与布局说明 |
| `pnpm test` | 444/444，通过；含新增 7 项追击归属、克隆顺序、隔离与布局回归 |
| `pnpm package` | 通过，包含类型检查；两份 HTML、两份 ZIP 和清单重新生成 |
| `node --test scripts/ci/*.test.mjs` | 13/13，通过 |
| `pnpm test:save-browser` | 9/9，通过；失败回滚/重复重试、备份导入导出、刷新及多窗口 |
| `node scripts/runtime-differential.mjs` | 4/4，通过；Phaser 与 Runtime 每帧比较，沿海/建筑各两种 seed，每例 240 帧模拟时间 |
| `pnpm test:mall-sample` | 22/22，通过；含旧布局 2 刷新恢复、新布局 3 与旧 Phaser 入口 |
| `pnpm test:raid-default` | 9/9，通过；普通街区/商场、旧行动恢复结算、无 WebGL 保档及触屏武器切换 |
| `pnpm test:portable` | 通过；临时目录解压 ZIP，普通 `file://` 入口离线操作、库存和暂停，无外部请求 |

投影和 Session 契约经过独立代码复核；首次整合前另以固定时钟、隔离内存存储对比原 `773dcdf` 与候选，4 种行动的捕获/恢复、写失败及重试记录一致。该对比不是自然游玩或浏览器验收。本批未修改战斗/AI/潮汐规则，未运行 10 分钟真实计时游玩；未做真人平衡性或真机手感验收。

## 下一步

本次为 #60 的首个可验收增量：按任务阅读、局部契约，以及两宿主共用的持久化字段映射。没有完成共享模拟内核、存档 codec 全面收敛或风险命令注册器，也未宣称修复总单全部缺陷。提交后核对 PR head 的全量 CI，等待维护者合并；后续阶段仍在 #60 确认依赖与归属。续作更新本摘要，不逐轮追加同样正文。

## 第二批

2026-10-22，分支 `agent/entropy-batch-2`，起点 main `345aff4`。依据当天的代码健康扫描：类型检查、单测和 CI 都绿，但死代码、只被测试使用的旧接口、重复实现和失效的 CI 外套件会拖慢下一步开发。本批只减熵，不改玩法、存档格式或界面行为。

**有效决定**

- 删掉没有任何使用者的 13 个导出和 6 处未用变量/导入；`tsconfig.json` 打开 `noUnusedLocals`、`noUnusedParameters`、`noImplicitOverride`、`noFallthroughCasesInSwitch`。
- 行动输入只保留一套设备状态 `InputState`：Phaser 时代的 `PlayerInput` 在生产里只用来生成空帧，改为 `idleFrame()`；原输入单测改测 `InputState`。
- 退役只被测试使用的旧接口：`domain.ts` 的 `writeSave`/`readSave`（直接写旧存档键、绕过修订栅栏）和 `shop.ts` 的布尔包装 `settleCart`，测试改用正式入口。`buy`/`sell`/`reload` 仍被多条救济规则测试用来造状态，本批保留。
- 合并重复：`src/html.ts` 的唯一 `esc`（原 5 份，3 份不转义单引号）；`rpg.ts` 的 `SUPPLY_IDS`（原 3 份清单，单测锁定它与 `useRpgItemResult` 一致）；`src/art/item-images.ts` 的物品图缓存（原 2 份）。`coast-view/inventory.ts` 因此不再反向依赖 `ui.ts`，视图层运行时 import 环从 5 个文件缩到 3 个。
- CI 外套件在 main 上已失效，改测试修复，产品未改：`test:station` A1 与 `test:hideout` 没有跳过 #56 的开场；A4 仍期待旧的无 WebGL 报错文本；`test:station-capability` 不认识 #64 常驻标题渲染器的 1 个固定监听（二分确认首败在 #64，关掉 #38 修复的反向对照仍失败）。`test:hideout` 在限 2 核软件渲染下 14 秒通过，转入 CI batch-6；`test:station-capability` 需要 16 个原生纹理单元，CI 软件渲染不满足，留作手动。
- 新守卫：每条 `test:*` 必须排进 CI 或登记为手动并写原因（`scripts/ci/browser-suites.mjs`）；`source-health.test.mjs` 拒绝无使用者的导出、新的运行时 import 环和规则模块的 DOM 依赖；`entry-docs.test.mjs` 要求入口文档的链接、锚点与路径存在。
- 文档：任务清单当前入口更新到 `345aff4`；历史文档 27 处死链改为删除前版本的永久链接或标注未入库，4 个开发手册锚点改到现编号。

**实际验证**（Windows、Node 24.19.0、本机 Chrome；生成物用 `node scripts/build.mjs`、`node scripts/package.mjs` 重建，单文件 5,605,866 → 5,602,342 字节）

| 检查 | 结果 |
| --- | --- |
| 严格类型检查（含新增四项开关） | 通过 |
| `node --import tsx --test tests/*.test.ts` | 453/453 |
| `node --test scripts/ci/*.test.mjs` | 45/45 |
| `test:station` | 76/76（完整一轮，约 8 分钟） |
| `test:hideout` | 8/8；另在限 2 核 SwiftShader 下 8/8、14 秒 |
| `test:station-capability` | 本机 GPU 4/4（199 秒）；另在 `345aff4`+补丁上关闭 #38 修复做反向对照，探针仍报原缺陷 |
| `test:desktop-input`、`test:mobile`、`test:ui`、`test:issue26-station`、`test:shop-drag` | 全部通过 |
| `test:coast-sample` | 53/53 |

**未做 / 下一步**

- 扫描确认的 10 个行为缺陷（含 1 个高：楼宇行动中敌人推门时写入失败后重试保存永远被拒）登记在 #60，修复另行交付。
- 剩余已知 import 环：存档 codec（Q-E05）、`ui.ts` 与 `coast-view/sample.ts`/`station-view/route.ts`（Q-E02），已登记在 `source-health.test.mjs`，只许变小。
- `test:station`、`test:coast-sample`、自然游玩与基准套件仍是手动；是否加固后进 CI 归 #61。
