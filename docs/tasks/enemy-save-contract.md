# EN-02/03：十八原型行动的持久化边界

## 当前实现：与已合入的 Perk #92 整合

基线 main `8b6192d`。记录同时读取历史 3/4/5/6 和组合格式 **7**；`ExpansionState` 仍为 1/2/3。行动版本是能力身份，不能用大小比较代替功能判断：

| 行动 | 角色状态 | 敌人规则 | 玩家弹丸规则 | 可承载记录 |
| --- | --- | --- | --- | --- |
| classic | 保持原状态 | 原四类 | 无 Perk 暴击 | 按现有记录 |
| LayeredRaid 1/2 | ExpansionState 1/2 | 原四类 | 无暴击 / 原中心接近度公式 | 4/6 |
| LayeredRaid 3 | ExpansionState 3 | 原四类 | Perk 开枪快照 | 5/7 |
| LayeredRaid 4 | ExpansionState 2 | 新敌人 | 原中心接近度公式 | 6 |
| LayeredRaid 5 | ExpansionState 3 | 新敌人 | Perk 开枪快照 | 7 |

新街区出击由初始化的 Perk 行动 3 升为组合行动 5，在同一原子候选里写记录 7。商场仍生成行动 3。恢复正在进行的 3/4 行动不改变敌人、弹丸、名册或规则；敌人旧行动 4 结算后，基地边界才升级角色到 3。源码入口是 `enemyRules`、`perkRaidRules`、`recordVersion` 和 `recordUpgradeFields`。

- `enemyBackup` 保存首次启用新敌人时被替换主档的精确原文，历史记录 6 的副本升 7 后保持不变。
- `perksBackup` 保留已有 5/7 的原值，包括 null；首次由 4 或 6 启用 Perk 时保存被替换主档原文。不把组合记录再次嵌入自身。
- 记录 7 同时要求两字段，只允许字符串或 null。外层/角色/行动版本组合、弹丸 owner、玩家暴击快照及新敌人战术字段都严格校验。
- 候选验证、持久提交和待提交事务导出共用版本字段构造。失败不发布版本、备份或奖励；超过 2 MiB 时仍整笔拒绝。
- 普通写入不降级。明确导入旧角色格式可以开始新升级周期；导入当前 Perk 格式或重新开始保留本地已有副本，新来源则保留导入记录的敌人/Perk 副本。

验证入口：[组合兼容回归](../../tests/enemy-perk-compatibility.test.ts)、[Perk 存档回归](../../tests/perk-save.test.ts)、[固定历史端探针](../../scripts/enemy-old-client-probe.ts)。本地完整单测 **701/701**、CI 规则 **53/53**；固定端 `35b3a38`、`76adbd6`、敌人 `dc14ad5`、Perk `8b6192d` 共 **80/80** 正反例通过，包含实际合法组合行动档 7。各端公开导入解码、主档初始化及失败后写入尝试均拒绝新档且保留原字节。浏览器、十分钟计时和准确 head CI 另记集成交付结果。

## 历史方案与探针记录（下文版本号不是当前格式）

对应 [#78](https://github.com/xuys2025/escape-bincov/issues/78)、[实施 PR #81](https://github.com/xuys2025/escape-bincov/pull/81)。2026-10-23 以任务 head `35b3a38223a7bb0020db25e9b2d0bb5476caa993` 检查源码。本文是**下一批实现的合同与已执行的历史端探针**；不把拟议字段描述成已实现，也不替代[既有兼容基线](enemy-foundation-compatibility.md)或源码类型/严格校验器。

## 版本与旧行动

采用新的 `SessionRecord.version = 5` 和新的 `LayeredRaid.version = 3`，`ExpansionState.version = 2` 继续表示已启用 RPG。不要将角色/基地状态版本改为 3 来表达敌人升级。classic 检查点仍走历史专用校验器；只有明确升级 classic 格式时才可在其记录中接受新字段。

新行动可以正式生成十八原型。已有活动分层行动 1/2、classic 检查点必须按原算法完成，保持原四 ID、出生人口、UID、名册、掉落、RNG 和既有状态；不能在 `load`、`initialize`、`resumeRun` 或 Runtime 构造时重新生成或补入新行为默认值。新会话版本若承载旧行动，也不能由外层版本推断其敌人行为已升级。行为选择必须看行动格式及其明确行为版本。

推荐在 `beginRun` 的独立候选中同时建立新行动并升级外层版本，原子提交成功后发布。若实现选择在基地提前升级外层版本，必须仍接受合法的历史活动行动并说明升级边界。现有 `legacyBackup`、`migrationBackup`、`systemsBackup` 的原始含义与字符串必须保留。新增一次性 `enemyBackup` 可保存首次升 v5 前的主档精确原字节；不能拿解析后序列化的文本冒充旧档，不能覆盖 `systemsBackup` 的 pre-v4 语义。包含历史备份后超出 2 MiB 时，整个候选应失败并保留当前主档，不截断历史备份。

## 字段归属、单位和边界

下表是实现命名的建议，最终字段以对应类型与严格校验器为唯一说明来源。只加入已实际影响下一帧行为的字段，不用空壳字段宣称已支持某机制。

| 所有者 | 必须持久的信息 | 单位、范围与引用约束 |
| --- | --- | --- |
| `EnemyState` 身份 | `uid`、正式原型 ID、行为版本；若武器可变，保存实际武器变体 | UID 为本行动唯一标识；原型/武器必须是自身白名单字符串键；禁止 `__proto__`、`constructor`、数组伪装键；原型出生后不随文案改变 |
| `EnemyState` 身体与空间 | hp、x/y、rotation、home、target、path，必要时最后目击位置 | hp 为有限值 `0..正式原型最大生命`；坐标和路径使用地图像素，必须在所属地图内；活体身体须适合碰撞空间；角度为弧度，沿用现有有限范围和恢复归一化 |
| `EnemyState` 感知 | stance、警戒阶段、最后目击及其时间；已确认的敌对关系 | stance/阶段为封闭枚举；时间用全局 `raid.elapsed` 秒，已发生时间为 `0..elapsed`；无目击用明确 `null`；不能从通信、重开或展示投影获得未观察的实时玩家坐标 |
| `EnemyState` 武器 | 弹匣、备弹、换弹剩余、连发剩余及下一发间隔 | 弹量为有界非负整数，弹匣不超过所持武器容量；剩余时间为秒，范围由武器/动作配置确定；自然近战不得携带枪械专用状态；跨层和重开不补弹 |
| `EnemyState` 攻击 | 动作阶段、阶段剩余、已锁定攻击方向/目标和本次是否已释放 | 阶段为封闭枚举；秒数必须有限且不超过对应动作时长；每次攻击最多释放一次伤害/弹丸；恢复前摇、释放后和恢复阶段都不能重发攻击 |
| `EnemyState` 搜索/巡逻 | 路线进度、有限搜索剩余、撤退或返家目标 | 进度为有效路径索引；坐标属于所属图；新格式倒计时原则上非负；旧 timer/cooldown/repath 的历史负数容忍范围仍由旧解码器维护 |
| `EnemyState` 群体状态 | 若支持小队，保存小队引用、有效命令及其发起者/时间、报警锁存 | 指挥仅向实际可联络的兼容阵营成员传播；发起 UID 必须存在；已发出报警不能因重开重复触发；不让动物或失控者读取人类指挥 |
| 行动级状态 | roster、地图实体、pursuits、kills、rng、nextEntity；若实现增援则另存事件账本 | 每 UID 恰有一个持久所有者；死亡敌人仍在 roster；地图与 pursuit 全体数量与名册一致；静态人口仍等于 `world.enemyCount`；kills 等于死亡数；rng 为 uint32，nextEntity 为未分配的有界正整数 |
| `PursuitState` | 完整 `enemy`、源/目标地图、入口、路径、距离、速度、注册/到达时间及等待状态 | 距离为像素，速度为像素/秒，时间用全局行动秒；路径和来源须可验证，仍满足 `arrivalAt = registeredAt + distance / speed + 1`；不能用旧敌人字段投影替换完整对象 |

装备/原型的静态数值可以从固定版本规则查询；出生时已经抽定的变体、攻击目标、弹药和行为状态不能在恢复时重抽。展示名称、颜色、可重算图层和未影响玩法的动画帧无需持久化，重算不得消费 gameplay RNG。恢复、失败重试和只读备份均不得消耗新的随机数。

仅增加十八种静态原型不意味着可以放宽人口守恒。若实现增援，须明确初始人口、可生成上限、唯一事件 ID、批次成员 UID、未触发/触发/完成状态以及分配序号；一次事件的状态、敌人、名册与 RNG 必须同一事务成功。不能只把 `world.enemyCount` 检查改成宽松上限。

## 源码调用点与不可机械替换的版本判断

以下定位基于上面的固定 head，后续以符号为准。

| 入口 | 必改/核对事项 |
| --- | --- |
| [recovery-store.ts](../../src/recovery-store.ts) `SessionRecord` / `decodeSession` / `RecoveryStore.commit` | 扩大外层版本集合；v4/v5 各自严格字段白名单；分层 raid 分支、terminal.reason、expansion 校验、返回版本不得把 5 规范化回 3；commit 不能把 v5 降回 4；完整扩展状态的导入降级栅栏和备份归属也要包含 5 |
| [save-backup.ts](../../src/save-backup.ts) `decodePortableBackup` | recovery envelope 允许格式 5，且 envelope 与记录版本必须相等；同时验证完整新状态；直接原始 session 导入同样走严格解码 |
| [session.ts](../../src/session.ts) `prepareExpansionMutation` | 当前手写 `version: 4` 的候选验证不可用于 v3 行动；应按实际候选确定正确会话版本，并保留升级备份 |
| 同文件 `persist` / `prepareSettlement` | `expansion.raid.version === 2` 的训练入账判断必须包含 3；`expansion.version === 2` 的 RPG/基地实时时钟判断保持原含义；失败不能发布候选 |
| 同文件 `beginRun` / `backupRecord` / `importRecord` | 仅新行动启用新格式；实时备份及待保存/延迟事务备份必须完整携带新字段和正确外层版本；导入、重试和结算均不得降级 |
| [expansion-state.ts](../../src/expansion-state.ts) `LayeredRaid` / `entityUid` / `validateExpansion` | 接受行动 3；v3 继承 v2 的带 runId 实体 UID、shockAt/mapEvent、敌弹 owner 归属规则；分别维护旧/新敌人的精确键和原型规则；地图与 pursuit 共用同一严格敌人校验器；名册同步校验正式原型 |
| [building-world.ts](../../src/building-world.ts)、[mall-world.ts](../../src/mall-world.ts) 初始化器 | 在新行动候选中完成正式原型分配、全部行为默认值与名册；出生随机数只在这里或明确分配流程消费；旧活动行动不得重新调用初始化器 |
| [layer-transition.ts](../../src/layer-transition.ts) `damageLayerEnemy` / `resolveLayerShot` / `changeLayer` | v2 的训练效率、幸运掉落、玩家受伤、暴击路径须覆盖 v3；追击视野、速度、死亡掉落与尸体名称不能继续只查四类 `D.ENEMIES` / `getLegacyEnemyProfile`；v3 跨层策略明确按原型执行 |
| [rpg.ts](../../src/rpg.ts) `enemyDamage` | `raid.version === 2` 的惊吓冷却与精神值规则须覆盖 3，保持 `shockAt` 在行动秒上的含义 |
| [raid-runtime/runtime.ts](../../src/raid-runtime/runtime.ts) `snapshot` / `restore` / `snapshotExpansion` / `restoreExpansion` | 旧/新行为派发、身体/伤害/尸体查询按敌人版本；capture 与 restore 携带完整敌人字段。layered 的 `Object.assign` 按 uid 复用实体时注意旧对象残留字段：格式切换不能留下不属于新对象的状态 |
| [raid-state-projection.ts](../../src/raid-state-projection.ts) 两端映射 | 保留完整新敌人对象，包括在源地图可见却由 pursuit 持有的对象；不能同时写入地图和 pursuit。内部 `ActiveRaidSnapshot.version = 2` 是 classic 形状适配器，不等同于持久 `LayeredRaid.version`，不能全局改为 3 |
| [fresh-start.ts](../../src/fresh-start.ts) / [hideout-runtime/runtime.ts](../../src/hideout-runtime/runtime.ts) | 新建档的格式策略要与升级点一致；基地 `ExpansionState.version === 2` 仍是 RPG 能力判断。原始备份导出不能因新格式读取失败而被禁用 |

当前 `Runtime`、AI、presentation 与跨层死亡处理还直接按 `D.ENEMIES[id]` 查询旧四类数据。不能只放宽存档白名单就认为十八原型已经可运行；新旧 profile/行为查询必须明确分离，旧 ID 不能改作新原型别名。

## 已运行：固定历史客户端拒绝与原字节保留

工具：[enemy-old-client-probe.ts](../../scripts/enemy-old-client-probe.ts)。它使用 `git cat-file --batch` 从两个完整提交提取明确的 `src/**/*.ts` 和一份历史测试夹具到忽略的本地证据目录；核对每个 Git blob SHA-1，并记录源码 SHA-256。运行时动态导入这些固定源文件里的真实 `RecoveryStore`、`SaveSession` 和 backup codec，不依赖可变当前工作树或模拟写入结果。

固定客户端：

- `35b3a38223a7bb0020db25e9b2d0bb5476caa993`：#81 本批已有兼容基线。
- `76adbd627f582d063cc6f80a4551e8b8cbe2dddd`：更早的固定 main 基线。

每端 19 项，共 **38 项实际通过**，Node **v24.19.0**：

| 每端案例 | 实际断言 |
| --- | --- |
| 7 项正对照：基地、classic、居民楼、商场 1/2/3、历史 prototype 分层 1 | 用同端真实 `SaveSession.beginRun` / 历史 fixture + `RecoveryStore.commit` 产生合法档；先解码及备份完整往返，再 load / initialize / persist 成功，精确增加 2 次写入/修订，保留内嵌备份字符串 |
| 7 项未知 session 5 | 其余结构为已验证合法档，仅改变外层版本，必须得到精确的会话不兼容错误 |
| 5 项未知内层 raid 3 | 外层仍为合法 v4，分别取居民楼、商场 1/2/3、prototype 分层 1；必须得到精确扩展格式不兼容错误；prototype 分层 1 没有 v2 独有键，能到达未知行动版本判断，避免仅因 v2 额外键而提前拒绝 |
| 每个反例共同检查 | 直接解码、原 session 备份、便携 envelope 和 `importRecord` 拒绝；`RecoveryStore.load` 失败后直接 commit 拒绝；`SaveSession.initialize` 失败后两次 persist 均拒绝；写入数为 0、记录未发布；`original()` 与读取后的主档逐字节一致；其原始备份写入本地后读回一致，包含原空白和内嵌历史备份 |

复现命令（仓库根）：

```powershell
& 'C:\Users\xty\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --import tsx scripts/enemy-old-client-probe.ts
```

本地报告：`test-results/enemy-old-client-probe/report.json`；每端目录含源对象哈希清单、有效档和拒绝后保留的原字节备份。未提交这些忽略的本地证据、未读取密钥、未修改历史工作树。

**签收边界：** 上述内置候选是版本栅栏 sentinel，不是已经实现的新敌人格式。结论仅为这两个固定历史端在同一 `escape-bincov.session.v2` 键上拒绝未知会话 5 / 行动 3，且失败后不覆盖；不声称所有历史发行端都已验证。正式 v5 实现完成后，先在新客户端证明实际新档严格有效，再将真实导出的新档作为参数复跑：

```powershell
node --import tsx scripts/enemy-old-client-probe.ts --candidate test-results/enemy-old-client-new-valid.json
```

`--candidate` 可以重复提供；传入实际原始 session 或 recovery envelope。报告会明确记录候选路径并追加两端真实拒绝检查。新客户端合法性必须由新格式回归另证，不能用历史端拒绝反推合法性。

## 实现签收仍需覆盖

新档必须覆盖全部现有地图/布局、十八原型与所有实际行为字段；新行动、检查点、重开、跨层追击、死亡尸体、背包/弹药事务、待保存结算、完整备份导入都经过真实 `SaveSession`。至少在前摇、伤害已释放、换弹中、警告后敌对、报警已发出、追击途中分别捕获并恢复，证明没有重发攻击、补弹、丢敌人或重复报警。失败保存/重试/重复提交/多窗口冲突保留旧提交，重试不重抽 RNG 和奖励。旧活动行动仍按原算法完成，未知/损坏字段保留原字节。完整单测、打包、浏览器存档与单文件离线验证由本次集成签收记录给出，本文的 38 项历史端探针不替代这些门槛。
## 实施更新：敌人与 Perk 版本分配

2026-10-23 根代理只读核对 Claude 的 `cp-save`：Perk 已占用 session v5、ExpansionState v3、LayeredRaid v3。
因此敌人实现使用 **session v6 / LayeredRaid v4**，当前仍携带 ExpansionState v2。
上文 v5/v3 是探针建立时的候选合同和历史版本哨兵，不是最终敌人存档号。
新外层的 `enemyBackup` 保存首次敌人出击前精确主档字节；旧活动行动不改 ID、不填新字段。
Perk 分支整合前，敌人分支明确拒绝它尚不理解的 session v5 / raid v3；整合时需同时保留两方能力与各自备份，不能只替换版本数字。
