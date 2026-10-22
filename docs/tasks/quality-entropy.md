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

## Q-E05 存档 codec 去环

2026-10-22，分支 `agent/save-codec-cycle`，起点 main `c8a5ed8`（已含 #68）。承接 #60 的 Q-E05，分工见 [#60 协作说明](https://github.com/xuys2025/escape-bincov/issues/60#issuecomment-6333683019)。只改结构：存档格式、接受/拒绝集合与迁移结果不变。

**有效决定**

- 新模块 `src/profile-codec.ts`，只依赖 domain：已解析 profile 的严格解码 `decodeProfileDocument`（含导出封套）、放在其他记录里的 profile `decodeStoredProfile`、各格式共用的物品栏检查 `validInventory`（旋转、未知字段按格式显式传入）和校验原语 `finite`/`whole`/`identity`、`COUNT_MAX`/`UINT32_MAX`。检查返回布尔或抛 profile 的错误，各格式保留自己的报错文案。
- 依赖方向：`checkpoint`、`recovery-store`、`save-backup` 单向调用 codec；`recovery-store` 不再引用 `save-backup`，`checkpoint` 不再把拼出的 profile 序列化成 JSON 去借 `decodeBackup`。`source-health.test.mjs` 的 `KNOWN_CYCLES` 删去 Q-E05。
- 实测确认后显式保留的既有边界：旧键 v2 存档、会话里的 profile 和经典行动携带物受 1 MiB 限制，按紧凑 JSON 计、源文本空白不算；这些 profile 里的导出封套字段仍按封套解读；携带物带少量未知字段照旧接受。
- 三处持久物品检查（profile 物品栏、经典检查点容器、分层行动物品栏）合成 `validInventory`。`validateCheckpoint`、`validateExpansion` 的整数上下界全部写明，不再依赖默认的 1e9。`domain.ts` 迁移用的整数强制转换语义不同，保留。
- expansion v1→v2 升级原有 4 份（`enableRpg`、`beginRun`、水产站导入、`freshStartRecord`），合成 `upgradeToRpg`。原来只在 v1 时才读时钟的两处保留判断，时钟调用次数不变。

**行为对照**

改动前用游戏自己的流程造 59 份种子：各代 profile 与备份封套、session v2–v4、coast-v1/v2 检查点（含行动中途）、分层街区、商场三版布局、四种结算与待结算备份、带 legacy/migration/systems 原字节的记录、恢复备份封套。按字段形状逐一变异（删字段、改类型、越界、小数、重复元素、未知键等），另加 21 个大小与封套边界用例，共 100,581 个用例。`decodeBackup`、`decodeSession`、`decodePortableBackup`、`encodeRecoveryBackup`、`RecoveryStore.load` 共 247,627 次调用，逐例记录接受/拒绝、报错类型与文案、规范化输出哈希。工具先在 `c8a5ed8` 自比两次，0 差异。

改动后：接受/拒绝集合与全部被接受用例的输出逐例一致，其余报错文案也一致。130 处差异只有一类：分层行动物品栏里的物品为 `null` 时，以前抛 JS 的 `TypeError: Cannot use 'in' operator…`，现在抛该模块的「建筑、角色或基地存档损坏或版本不兼容。原始数据已保留。」。用改动后的代码重造 59 份种子，与原种子逐字节相同，开启成长、出击和结算的写入流程未变。

**实际验证**（Windows、Node 24.22.1、pnpm 11.19.0、本机 Chrome）

| 检查 | 结果 |
| --- | --- |
| 严格类型检查 | 通过 |
| `pnpm test` | 463/463（新增 4 项：存储 profile 大小规则、解码结果不共享对象、统一物品栏规则、`upgradeToRpg`） |
| `node --test scripts/ci/*.test.mjs` | 48/49；唯一失败的 shell 门禁用例在 Windows 写死 `C:/Program Files/Git/bin/bash.exe`，本机 Git 不在该路径，未改动的 `c8a5ed8` 同样失败，CI 在 Linux 上执行 |
| `pnpm package` | 通过，两份 HTML、两份 ZIP 与清单重新生成 |
| `test:save-browser` | 9/9 |
| `test:expansion` | 5/5，旧客户端取自 `07b1414` 的 `dist/index.html` |
| `test:portable`、`test:systems`、`test:station-reset`、`test:hideout` | 通过（systems 13/13） |
| `test:loot`、`test:qol-expansion`、`test:raid-default`、`test:buildings` | 25/25、4/4、9/9（含旧封锁区与商场一版行动恢复后结算）、8/8 |

**未做 / 下一步**

- Q-E02 路由收敛由同一承接者随后续作：`ui.ts` 与两个视图路由的三角、共享 Pixi 池可以先做；行动句柄合同和背包有限服务与 PR #65 改同一批文件，建议 #65 合入后再做。
- #60 评论登记的 Q-E04 类问题本批未改：`persist` 把校验异常当作存储失败、行动与据点的失败票据处理不一致、被拒票据留在 `SaveSession.prepared`。
- 新发现：`validateExpansion` 的装备检查用 `D.WEAPONS[weapon]`，没有 `Object.hasOwn`。分层行动携带物的 `weapon` 写成 `constructor`、`toString` 等原型键时会被接受，不存在的名字则会被拒绝。修复会改变接受集合，本批不改，另行处理。
