# 代码任务导航

本页定位当前代码，不记录逐轮进度。工作约束见 [AGENTS](../AGENTS.md)，职责与兼容见 [ARCHITECTURE](ARCHITECTURE.md)，任务归属见 [WORK-QUEUE](WORK-QUEUE.md)及原 PR 最新状态。

定位影响面后，用[检查导航](CHECKS.md)选择相关风险、真实旧客户端等前置和诊断；它只列出要求，不能替代下面各卡片的具体反例与调用边界。

先读任务对应的卡片，再定位所列符号和测试；发现新的调用者或兼容路径时扩展阅读。这里不是允许改动的文件白名单，也不要求把链接文件全部读完。

| 要做什么 | 首读卡片 | 扩展条件 |
| --- | --- | --- |
| 交易、库存操作、拒绝原因 | [交易](#交易) | 新物品再看领域数据；交互变更再看视图 |
| 行动命令、输入、暂停或恢复 | [行动输入](#行动输入) | 触屏按钮、DOM 绑定、持久字段分别扩展 |
| 新持久字段、迁移、导入、恢复 | [存档](#存档) | 活动行动字段必须核对两端捕获/恢复 |
| 负重、上限等画面读数不一致 | [派生读数](#派生读数) | 先分清实时模拟、最近检查点与失败候选，再查格式化 |

地图/碰撞从 [expansion-worlds.ts](../src/expansion-worlds.ts) 的 `resolveExpansionWorld` 和 [spatial.ts](../src/spatial.ts) 进入；画面/资源从 [station-view/route.ts](../src/station-view/route.ts)、[coast-view/sample.ts](../src/coast-view/sample.ts) 追宿主；两者经 [navigation.ts](../src/navigation.ts) 请页面（[ui.ts](../src/ui.ts) 注册）换画面，不直接导入页面，轮用 [pixi-app.ts](../src/pixi-app.ts) 的同一个 Pixi 应用。只改素材时无需先读交易和迁移实现。

## 交易

**职责与所有者。** 商店规则生成结果；唯一 `SaveSession` 提交；水产站和旧页签负责输入与反馈。购物车是临时状态，不能冒充已保存的库存。

**首读路径：新增购买限制或一类库存操作。**

1. [hideout-runtime/contract.ts](../src/hideout-runtime/contract.ts)：`Result`、`CartView`、`ShopSession`，确认调用端能区分拒绝、确认和完成。
2. [shop.ts](../src/shop.ts)：`settleCartResult`、`CartRejection`、`cartRejectionMessage`；改变供货范围再读 `merchantStock`。
3. [hideout-runtime/runtime.ts](../src/hideout-runtime/runtime.ts)：`RealHideoutRuntime.openShop` → `transaction`。新增据点操作沿用候选事务入口。
4. [session.ts](../src/session.ts)：`prepareExpansionMutation` / `commitExpansionMutation`；旧页签适配还走 `mutate`，需要同时核对。
5. [station-view/ui.ts](../src/station-view/ui.ts) 的 `settle` 与 [ui.ts](../src/ui.ts) 的 `checkout`：只检查该操作的结果呈现和后续副作用。

**调用契约的维护位置。** `ShopSession` 方法旁写调用方需要知道的临时车、确认票据、失败与重置语义；事务回调限制放在 `SaveSession` 入口。价格、资格算法、物品清单以规则代码为准，不抄到卡片。

**验证入口。**

- [shop.test.ts](../tests/shop.test.ts)：购物车守恒、净额交易、拒绝时整笔不变；救济品或别家商人的货硬塞进清单，结算也整笔拒绝。
- [hideout-runtime.test.ts](../tests/hideout-runtime.test.ts)：`shop retains disposable cart on quota failure`、`shop reasons distinguish`、`quest sale requires confirmation`、`the station shop refuses to list relief`。
- [save-flow.test.ts](../tests/save-flow.test.ts)：`merchant purchases and quest submission roll back`，经旧页签「统一结算」按钮走 `checkout` → `mutate`：写入失败回滚并保留购物车，重试只写一次。

这些是定位相关断言的入口；修改后仍按[验证矩阵](AGENT-HANDBOOK.md#4-按风险验证)执行必要检查，不把测试文件存在当作已验证。

**按需继续。**

- 物品或商人定义：[domain.ts](../src/domain.ts) 的 `ITEMS`、`MERCHANTS`、`buyQuantity`；格位/转移规则：[loot.ts](../src/loot.ts)。
- 拖放、局部反馈：[station-view/panels.ts](../src/station-view/panels.ts)、[shop-feedback-test.mjs](../scripts/shop-feedback-test.mjs)。
- 自动拆分：[station-view/ui.ts](../src/station-view/ui.ts) 的 `UI.split` → 据点 Runtime `split` → [loot.ts](../src/loot.ts) 的 `moveQuantity`。`placementError === null` 包含合堆与交换；寻找空格还要检查 `D.fits`，不能把可接受的落点都当成空位。
- Perk 选择与 500 现金重置：据点 Runtime 的 `perkBoard`、`previewPerk` → `choosePerk`、`previewPerkReset` → `resetPerks` → `transaction`，院子与旧页签共用。确认票据绑定的内容和失败重试写在 [contract.ts](../src/hideout-runtime/contract.ts) 方法旁，选择规则在 [perks.ts](../src/perks.ts)；验证见 [perk-base.test.ts](../tests/perk-base.test.ts)。界面入口是院子 [station-view/ui.ts](../src/station-view/ui.ts) 的 `confirmPerk` 和旧页签 [ui.ts](../src/ui.ts) 的 `confirmPerkTab`（写入失败只经 `retrySave` 重试）；Perk 名称、效果文案、预览行和静态暴击显示都在 [perk-copy.ts](../src/perk-copy.ts)，验证见 [perk-copy.test.ts](../tests/perk-copy.test.ts) 与 [perk-ui-browser.mjs](../scripts/perk-ui-browser.mjs)。
- 新增需要保存的购买记录：继续[存档卡](#存档)，不能只改商店类型。

**结束定位的判据。** 能说清规则在哪执行、哪个入口提交、失败时哪些对象保留/回滚、两个 UI 如何得知结果；与本任务无关的世界和素材不继续展开。

## 行动输入

**职责与所有者。** 输入适配器产生意图，行动执行器消费意图。所有行动都走 Pixi 宿主 + `CoastRaidRuntime`（含切换前开始的旧沿海检查点和商场一版行动）；同一次行动只交给一个执行器和宿主。

**首读路径：增加一种命令或修改按下/按住语义。**

1. [raid-runtime/contract.ts](../src/raid-runtime/contract.ts)：`RaidIntent`、`RaidRuntime`，先区分边沿、持续输入、暂停与屏蔽。
2. [coast-view/input.ts](../src/coast-view/input.ts)：`Action`、`ACTION_KEYS`、`InputState.read` / `suppressHeld`。
3. [input.ts](../src/input.ts)：`InputFrame`、`idleFrame` 与 `ActiveClock`，Runtime 内部把意图转成逐子步输入时使用；设备状态只在 `InputState` 一处。
4. [raid-runtime/runtime.ts](../src/raid-runtime/runtime.ts)：`CoastRaidRuntime.advance` 中的转换与子步消费，再看 `step`；开火走 `pull`（本帧的点击/按住在帧末生效）→ `runTrigger`（子步内按冷却、换弹到期时刻开火）→ `shoot`。
5. [shooting.ts](../src/shooting.ts)：开火方式、精瞄举枪、晃动、连射散布和后坐的纯规则与参数（维护者选定的“稳定”一套、样本自动枪）；状态只在 Runtime 内存里，不进存档。
6. [coast-view/host.ts](../src/coast-view/host.ts)：键鼠/触屏事件、面板与 `layer` 事件后的按键释放（`suppressHeld`）；搜刮面板里移动键（`isMoveKey`）直接离开并开始移动（#26 F13），回归在 [loot-browser-test.mjs](../scripts/loot-browser-test.mjs)。

画面服务的 `CoastHandle` / `CoastServices` 也在 Runtime 契约中；[raid-runtime/host.ts](../src/raid-runtime/host.ts) 的工厂用 `satisfies CoastHandle` 检查接线。扩展端口时让类型检查发现漏接，不用双重类型断言绕过。

**调用契约的维护位置。** `RaidIntent` 旁说明坐标/时间单位和边沿消费；输入类说明释放及面板抑制；`RaidRuntime` 旁说明暂停、屏蔽和销毁。不在每个按钮复制这些规定。

宿主挂载/换层烘焙后的重新对时见 `RaidRuntime.resetClock` 契约；按编号拾取看 `CoastRaidRuntime.activate` 的 ground 引用路径及 `nearbyLoot`。拒绝事件的文案/门原因码见 `ViewEventBody`，原子性与重对时回归见 [runtime-gaps.test.ts](../tests/runtime-gaps.test.ts)，旧世界恢复与六种夹具严格校验见 [runtime-closeout.test.ts](../tests/runtime-closeout.test.ts)。

**验证入口。**

- [input.test.ts](../tests/input.test.ts)：`InputState` 的单次按下、取消、held-input 释放和面板切换，以及 `ActiveClock`。
- [coast-input.test.ts](../tests/coast-input.test.ts)：触屏朝向、摇杆优先级和禁用读取。
- [raid-runtime.test.ts](../tests/raid-runtime.test.ts)：`commands reach only the first substep`、`blocked panels advance the world`。
- [shooting.test.ts](../tests/shooting.test.ts)、[shooting-bench.test.ts](../tests/shooting-bench.test.ts)：射击规则的时间切分不变性；固定种子与输入在不同帧率下的弹道、双端开火方式、暂停/面板取消、稳定与后坐。
- [breath-runtime.test.ts](../tests/breath-runtime.test.ts)：屏息 Perk 在真实帧和开枪中的蓄力、各中断清空与弹丸快照（CP-12～18）；纯规则在 [breath.test.ts](../tests/breath.test.ts)。行动 HUD 的暴击投影（静态、屏息目标、旧行动、匕首）与开枪快照一致见 [crit-hud.test.ts](../tests/crit-hud.test.ts)，浏览器中的武器卡与截图见 [perk-ui-browser.mjs](../scripts/perk-ui-browser.mjs) 的 R 步骤。
- [raid-clock.test.ts](../tests/raid-clock.test.ts)、[bullet-time.test.ts](../tests/bullet-time.test.ts)：子步时间跨追击/涨潮/训练边界和写失败，以及本步晚出生弹丸只推进剩余时长；不能为了调整射击而先把整帧时间发布给所有子步。
- [coast-sample-test.mjs](../scripts/coast-sample-test.mjs)、[desktop-input-test.mjs](../scripts/desktop-input-test.mjs)、[mobile-test.mjs](../scripts/mobile-test.mjs)：真实输入在 2.5D 宿主上的浏览器断言。

**按需继续。**

- 新触屏按钮：[coast-view/host.ts](../src/coast-view/host.ts) 的 `.cs-touch` 按钮绑定。
- 浏览器事件归属/失焦：[main.ts](../src/main.ts)、宿主事件处理；不要把 DOM 引入纯规则。
- 选择区域/布局：[raid-areas.ts](../src/raid-areas.ts) 的 `raidWorlds`、`defaultWorld`、`sampleMallLayout`；`sampleEnabled` 只识别显式样板标记。县域选图展示在 [station-view/deploy-map.ts](../src/station-view/deploy-map.ts)（地标坐标、标签方向、路线与插图焦点，验证见 [deploy-map.test.ts](../tests/deploy-map.test.ts)）；`deploymentWorld` 只允许现有区域白名单，未开发区域的预览只存在于站内 UI，不创建世界或修改存档。地图与插图只由 [county-art.ts](../src/station-view/county-art.ts) 在渲染侧导入（构建按清单核对）；出击面板重绘经 [morph.ts](../src/station-view/morph.ts) 就地更新，换区的滑动与入场动画依赖元素保留，浏览器回归在 `test:raid-default` 的 R10/R11。行动视图能否接管存档里的行动看 [coast-view/sample.ts](../src/coast-view/sample.ts) 的 `sampleSupports`。
- 显示新动作：[raid-runtime/presentation.ts](../src/raid-runtime/presentation.ts) 的 `frameView` 与渲染端；这是展示投影。射击状态在 `hud.aim`，屏息蓄力在 `hud.breath`（规则在 [breath.ts](../src/breath.ts)，Runtime 在 `step` 逐子步取瞄准目标、在 `runTrigger` 推进，清空点列在 `CoastRaidRuntime.breath` 注释）。手中枪械的暴击率在 `hud.crit`，与开枪取同一份 `CoastRaidRuntime.shotCrit` 快照；武器卡底部的文字由 [perk-copy.ts](../src/perk-copy.ts) 的 `critHud` 生成、[coast-view/host.ts](../src/coast-view/host.ts) 的 `critLines` 绘制，界面不再推算概率。
- 鼠标瞄准与镜头：[coast-view/scene.ts](../src/coast-view/scene.ts) 的 `aimFromClient` 经平滑镜头换算瞄准，镜头前探由 [coast-view/camera.ts](../src/coast-view/camera.ts) 的 `pointerLead` / `stepLead`（鼠标，只在精瞄时）或 `aimLead`（触屏）决定；鼠标前探碰到地图边就停，上限由 `leadRoom` 给出（#80）。改前探前先跑 `test:shooting` 的“静止指针不漂”（检查 a 在空地，a-edge 在地图边）和 [coast-camera.test.ts](../tests/coast-camera.test.ts)。
- 受击反馈（#75）：画面从 [coast-view/scene.ts](../src/coast-view/scene.ts) 的 `blow()` 开始，负责闪白、顺弹道后退和受击/恢复姿态；姿态只在角色用本种类自己的身体图时换帧（`posable`）。姿态帧由 [export-hurt-poses.ts](../scripts/export-hurt-poses.ts) 从 #96 图集切出，[coast-view/pose-assets.ts](../src/coast-view/pose-assets.ts) 加载。声音在 [coast-view/sound.ts](../src/coast-view/sound.ts) 的 `struck`，暴击与击杀标记在 [coast-view/host.ts](../src/coast-view/host.ts) 的 `mark` / `critMark`。回归看 `test:shooting` 检查 g、h 与 [hurt-poses.test.ts](../tests/hurt-poses.test.ts)。
- 试枪场：[range/](../src/range/index.ts)（`?range=1`，内存存档，不碰正式存档）。
- 动作新增可恢复计时器/状态：继续[存档卡](#存档)，检查点投影与展示投影不是同一契约。

**结束定位的判据。** 能跟踪一次输入到实际动作，并指出重复消费、失焦/面板释放的断言。资源生命周期只有在本次改变宿主归属时才展开。

## 存档

**职责与所有者。** `SaveSession` 协调唯一会话和完整候选；`RecoveryStore` 比对旧记录、验证并单次写入。场景通过捕获/恢复端口提供活动世界，UI 不自行组装另一套提交过程。

**首读路径：增加持久字段或修改恢复行为。**

1. [expansion-state.ts](../src/expansion-state.ts)：字段所属类型、`newExpansion` 与唯一的据点边界升级 `upgradeToRpg`（v1→v2→v3）、`rpgEnabled`、`validateExpansion` / `exactKeys`。纯派生显示值无需自动入档。
2. [session.ts](../src/session.ts)：`ensureRpg` / `enableRpg`、`enableExpansion`、`beginRun` → [building-world.ts](../src/building-world.ts) 的 `initializeBuildingRaid` / [mall-world.ts](../src/mall-world.ts) 的 `initializeMallRaid`；读取 `persist` 的完整写入链，而非只搜字段名。
3. 同文件继续按操作读：`prepareExpansionMutation` / `commitExpansionMutation`、`prepareSettlement` / `retrySettlement`、`backupRecord`、`importRecord`。
4. [profile-codec.ts](../src/profile-codec.ts)：各格式共用的严格 profile 与物品栏规则（`decodeStoredProfile`、`validInventory`）；[recovery-store.ts](../src/recovery-store.ts)：`SessionRecord`、`decodeSession`、`RecoveryStore.commit`；[save-backup.ts](../src/save-backup.ts)：`encodeRecoveryBackup` / `decodePortableBackup`。
5. [hideout-runtime/runtime.ts](../src/hideout-runtime/runtime.ts)：`previewImport` / `importBackup` 的确认与升级；[fresh-start.ts](../src/fresh-start.ts)：`freshStartRecord` / `startOver` 的完整新档路径。
6. 当前层与完整记录的共享映射：[raid-state-projection.ts](../src/raid-state-projection.ts) 的 `applyActiveRaidSnapshot` / `activeRaidCheckpoint`；这里不克隆、不提交。
7. 执行器端核对 [raid-runtime/runtime.ts](../src/raid-runtime/runtime.ts) 的 `snapshot` / `restore`、`snapshotExpansion` / `restoreExpansion`；旧检查点还读 [checkpoint.ts](../src/checkpoint.ts) 的 `RaidCheckpoint` / `initialCheckpoint` / `validateCheckpoint`。

**调用契约的维护位置。** 字段单位和合法范围归类型/校验器；`persist` 写入时的捕获与发布归会话入口；兼容策略归 [ARCHITECTURE](ARCHITECTURE.md#格式与恢复兼容)。卡片只维护路径，不再复制 schema。

**验证入口。**

- [expansion-recovery.test.ts](../tests/expansion-recovery.test.ts)：原子升级、严格导入拒绝、完整备份与待保存候选。
- [perk-save.test.ts](../tests/perk-save.test.ts)：session v5/Perk 选择、进行中的旧行动保持 v4 至结算、旧备份导入、降级保护与 `perksBackup`。
- [systems-session.test.ts](../tests/systems-session.test.ts)、[recovery.test.ts](../tests/recovery.test.ts)：重试不重复奖励、未知字段、原字节保留、修订栅栏。
- [save-flow.test.ts](../tests/save-flow.test.ts)、[hideout-runtime.test.ts](../tests/hideout-runtime.test.ts)：结算保存失败、导入确认、升级和旧入口。
- [fresh-start.test.ts](../tests/fresh-start.test.ts)：重开和恢复备份；活动世界再看 [raid-runtime.test.ts](../tests/raid-runtime.test.ts) 的回滚/恢复断言。
- [raid-state-projection.test.ts](../tests/raid-state-projection.test.ts)：当前层/追击归属、非当前层保留、建筑及商场捕获恢复。
- [save-validation-audit.test.ts](../tests/save-validation-audit.test.ts)：原型键、数组伪装 ID 的拒绝与原字节保留，及正常基地/经典/分层记录对照。外部 ID 必须先用 `hasOwnStringKey` 检查字符串类型和自身键，不能只做真值查表或 `Object.hasOwn`。

**按需继续。** profile 字段进入 [domain.ts](../src/domain.ts) 的迁移与 [profile-codec.ts](../src/profile-codec.ts) 的校验；数据夹具进入 [tests/fixtures/layered.ts](../tests/fixtures/layered.ts)；真实文件导入和多窗口见 [save-browser-test.mjs](../scripts/save-browser-test.mjs)。

**结束定位的判据。** 新建、旧档升级、活动恢复、失败重试、完整导入/导出和重开都能说明字段来源；不能只补一个类型和默认值就结束。

## 派生读数

**首读路径。** [raid-runtime/contract.ts](../src/raid-runtime/contract.ts) 的 `CoastServices` / `HudView` → [raid-runtime/host.ts](../src/raid-runtime/host.ts) 接线 → [raid-runtime/runtime.ts](../src/raid-runtime/runtime.ts) 的 `carriedWeight` / `carryLimit` → [coast-view/inventory.ts](../src/coast-view/inventory.ts) 的 `render` / `refreshWeight`。

行动中的 `Runtime.layered` 随模拟推进，`SessionState.expansion` 是最近提交后的状态，不能拿它重新计算实时上限。优先复用帧或只读服务里的权威值；显示层只做舍入与排版。背包打开时世界仍推进，更新读数只改对应文本，不能重建网格打断拖放。回归入口：[carried-weight.test.ts](../tests/carried-weight.test.ts)，覆盖护符、弹药、临时力量过期及保持放置状态。

**结束定位的判据。** 能指出数值由谁计算、使用哪个时钟、什么时候刷新；修改展示不会写存档，临时效果过期后玩法与显示保持一致。

## 维护本页

公开端口、提交边界或文件归属改变时，在同一个 PR 更新对应卡片；内部算法变化无需重抄实现。路径/符号改名同步修链接，当前行为与计划分开写。先查符号和调用点，再扩大阅读；不按固定行数拆源码，不生成手工全量符号表，也不为每目录增加重复 AGENTS。

CI 的 [source-health.test.mjs](../scripts/ci/source-health.test.mjs) 拦下三类退化：没有任何使用者的导出、新的运行时 import 环（#60 登记过的两个已消除，`KNOWN_CYCLES` 为空）、规则模块（domain/balance/world）引用彼此以外的模块或 DOM；`tsconfig.json` 另禁止未用的局部变量和参数。删掉旧代码时连同只为它存在的测试一起迁移，不要为通过检查而保留空导出。
