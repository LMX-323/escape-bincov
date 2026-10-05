# PR16 逐项验收登记

2026-10-05。共16条建筑、23条RPG、34条商场原始需求。B/R 编号仅用于登记，G/L/S/U/P 沿用商场原编号。原型证据不表示正式玩法已验收；状态“未实现”包含尚未接入场景或未完成该条完整行为。实施提交定位以本文件 Git 历史与 PR #16 各阶段提交为准。

M0 专项证据见 [状态与兼容决策](M0-STATE-AND-COMPAT.md)；原始需求保持完整，以下不改写预期。

## BUILDING-LOGIC.md

| 登记ID | 需求定位/摘要 | 工作包 | 完整状态 | 实现提交/证据 |
| --- | --- | --- | --- | --- |
| B-01 | [门窗与墙](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/BUILDING-LOGIC.md#L183) | M1-A | 未实现 | M0原型局部证据：[M0决策](M0-STATE-AND-COMPAT.md#5-专项复现与证据)；正式用例待对应阶段提交 |
| B-02 | [门操作](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/BUILDING-LOGIC.md#L184) | M1-B | 未实现 | 待对应阶段实现提交与用例 |
| B-03 | [入口双向往返](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/BUILDING-LOGIC.md#L185) | M1-C/D | 未实现 | 待对应阶段实现提交与用例 |
| B-04 | [交互竞争](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/BUILDING-LOGIC.md#L186) | M1-D | 未实现 | 待对应阶段实现提交与用例 |
| B-05 | [堵塞落点](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/BUILDING-LOGIC.md#L187) | M2-B/D | 未实现 | M0原型局部证据：[M0决策](M0-STATE-AND-COMPAT.md#5-专项复现与证据)；正式用例待对应阶段提交 |
| B-06 | [延迟追击](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/BUILDING-LOGIC.md#L188) | M2-C/D | 未实现 | M0原型局部证据：[M0决策](M0-STATE-AND-COMPAT.md#5-专项复现与证据)；正式用例待对应阶段提交 |
| B-07 | [连续换层](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/BUILDING-LOGIC.md#L189) | M2-C/D | 未实现 | M0原型局部证据：[M0决策](M0-STATE-AND-COMPAT.md#5-专项复现与证据)；正式用例待对应阶段提交 |
| B-08 | [追击路径变化](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/BUILDING-LOGIC.md#L190) | M2-D | 未实现 | 待对应阶段实现提交与用例 |
| B-09 | [物资与敌人守恒](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/BUILDING-LOGIC.md#L191) | M2/M6-D | 未实现 | 待对应阶段实现提交与用例 |
| B-10 | [离层结算、冻结与恢复](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/BUILDING-LOGIC.md#L192) | M2-A/B | 未实现 | M0原型局部证据：[M0决策](M0-STATE-AND-COMPAT.md#5-专项复现与证据)；正式用例待对应阶段提交 |
| B-11 | [室内超时与潮汐](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/BUILDING-LOGIC.md#L193) | M2-B/D | 未实现 | 待对应阶段实现提交与用例 |
| B-12 | [刷新与备份](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/BUILDING-LOGIC.md#L194) | M0-B/M2-E | 未实现 | M0原型局部证据：[M0决策](M0-STATE-AND-COMPAT.md#5-专项复现与证据)；正式用例待对应阶段提交 |
| B-13 | [故障回滚](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/BUILDING-LOGIC.md#L195) | M0-C/M2-E | 未实现 | M0原型局部证据：[M0决策](M0-STATE-AND-COMPAT.md#5-专项复现与证据)；正式用例待对应阶段提交 |
| B-14 | [多窗口与旧档](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/BUILDING-LOGIC.md#L196) | M0-B/D | 未实现 | M0原型局部证据：[M0决策](M0-STATE-AND-COMPAT.md#5-专项复现与证据)；正式用例待对应阶段提交 |
| B-15 | [结算](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/BUILDING-LOGIC.md#L197) | M3-E/M5-B | 未实现 | 待对应阶段实现提交与用例 |
| B-16 | [画面与离线](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/BUILDING-LOGIC.md#L198) | M7 | 未实现 | 待对应阶段实现提交与用例 |

## RPG-SYSTEM-DESIGN.md

| 登记ID | 需求定位/摘要 | 工作包 | 完整状态 | 实现提交/证据 |
| --- | --- | --- | --- | --- |
| R-01 | [状态阈值](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L382) | M3-A | 未实现 | 待对应阶段实现提交与用例 |
| R-02 | [状态恢复](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L383) | M3-A | 未实现 | 待对应阶段实现提交与用例 |
| R-03 | [临时上限](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L384) | M3-A/B | 未实现 | M0原型局部证据：[M0决策](M0-STATE-AND-COMPAT.md#5-专项复现与证据)；正式用例待对应阶段提交 |
| R-04 | [状态效果](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L385) | M3-B | 未实现 | 待对应阶段实现提交与用例 |
| R-05 | [负重](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L386) | M3-A | 未实现 | 待对应阶段实现提交与用例 |
| R-06 | [成长](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L387) | M3-D | 未实现 | 待对应阶段实现提交与用例 |
| R-07 | [防刷](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L388) | M3-C | 未实现 | 待对应阶段实现提交与用例 |
| R-08 | [失败成长](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L389) | M3-E | 未实现 | M0原型局部证据：[M0决策](M0-STATE-AND-COMPAT.md#5-专项复现与证据)；正式用例待对应阶段提交 |
| R-09 | [命中位置](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L390) | M4-A | 未实现 | 待对应阶段实现提交与用例 |
| R-10 | [暴击公式](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L391) | M4-A | 未实现 | 待对应阶段实现提交与用例 |
| R-11 | [随机爆头](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L392) | M4-A/B | 未实现 | 待对应阶段实现提交与用例 |
| R-12 | [霰弹与伤害](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L393) | M4-B | 未实现 | 待对应阶段实现提交与用例 |
| R-13 | [buff叠加](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L394) | M4-E | 未实现 | 待对应阶段实现提交与用例 |
| R-14 | [声望](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L395) | M4-C | 未实现 | 待对应阶段实现提交与用例 |
| R-15 | [声望回退](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L396) | M4-C | 未实现 | 待对应阶段实现提交与用例 |
| R-16 | [幸运](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L397) | M4-D | 未实现 | 待对应阶段实现提交与用例 |
| R-17 | [幸运幂等](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L398) | M4-D | 未实现 | 待对应阶段实现提交与用例 |
| R-18 | [基地](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L399) | M5-A/B | 未实现 | 待对应阶段实现提交与用例 |
| R-19 | [离线位置](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L400) | M5-F | 未实现 | 待对应阶段实现提交与用例 |
| R-20 | [分段计时](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L401) | M5-F | 未实现 | 待对应阶段实现提交与用例 |
| R-21 | [工作台](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L402) | M5-D/E | 未实现 | 待对应阶段实现提交与用例 |
| R-22 | [时钟与故障](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L403) | M0-C/M5-F | 未实现 | M0原型局部证据：[M0决策](M0-STATE-AND-COMPAT.md#5-专项复现与证据)；正式用例待对应阶段提交 |
| R-23 | [旧档与结算](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/RPG-SYSTEM-DESIGN.md#L404) | M0-B/D | 未实现 | M0原型局部证据：[M0决策](M0-STATE-AND-COMPAT.md#5-专项复现与证据)；正式用例待对应阶段提交 |

## MALL-VALIDATION-MAP.md

| 登记ID | 需求定位/摘要 | 工作包 | 完整状态 | 实现提交/证据 |
| --- | --- | --- | --- | --- |
| G-01 | [层不变；区域/屋顶显示正确；无重投、无卡门](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L335) | M1/M6-A～C | 未实现 | 待对应阶段实现提交与用例 |
| G-02 | [轮廓与碰撞一致，不产生单格陷阱](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L336) | M1/M6-A～C | 未实现 | 待对应阶段实现提交与用例 |
| G-03 | [主路/支路可达；不穿高架、不剪角](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L337) | M1/M6-A～C | 未实现 | 待对应阶段实现提交与用例 |
| G-04 | [B 阻挡移动/命中/视线；M 只挡移动；V 均不挡](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L338) | M1/M6-A～C | 未实现 | 待对应阶段实现提交与用例 |
| G-05 | [乐园外圈可走；池内、栏外、地下不可进入](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L339) | M1/M6-A～C | 未实现 | 待对应阶段实现提交与用例 |
| G-06 | [仅对应端点换层；合法站位；无重复实体](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L340) | M1/M6-A～C | 未实现 | 待对应阶段实现提交与用例 |
| G-07 | [一次按下只切一次；旧攻击/移动不延续](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L341) | M1/M6-A～C | 未实现 | 待对应阶段实现提交与用例 |
| G-08 | [有空位按固定顺序落点；堵满时不切层](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L342) | M1/M6-A～C | 未实现 | 待对应阶段实现提交与用例 |
| G-09 | [独有陈设和材质可辨；纯装饰不提示开箱](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L343) | M1/M6-A～C | 未实现 | 待对应阶段实现提交与用例 |
| L-01 | [只命中同层合法目标；子弹不跨楼板](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L349) | M2/M6-D/E | 未实现 | 待对应阶段实现提交与用例 |
| L-02 | [只能操作当前层；另一层数量和已搜空状态不变](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L350) | M2/M6-D/E | 未实现 | 待对应阶段实现提交与用例 |
| L-03 | [只同层调查声源；无全局声源串层](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L351) | M2/M6-D/E | 未实现 | 待对应阶段实现提交与用例 |
| L-04 | [敌人实际到达入口并沿连接追击，保留 ID/生命](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L352) | M2/M6-D/E | 未实现 | 待对应阶段实现提交与用例 |
| L-05 | [寻路使用合法连接；拥挤能恢复，不永久锁死](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L353) | M2/M6-D/E | 未实现 | 待对应阶段实现提交与用例 |
| L-06 | [离层后立即一次结算来源层弹丸，再冻结该层；合法伤害/击杀/掉落各一次，无遗留在途弹丸；失败恢复结算前完整状态](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L354) | M2/M6-D/E | 未实现 | M0原型局部证据：[M0决策](M0-STATE-AND-COMPAT.md#5-专项复现与证据)；正式用例待对应阶段提交 |
| L-07 | [不可操作地面物；不会撤离；露台仍显示 F2](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L355) | M2/M6-D/E | 未实现 | 待对应阶段实现提交与用例 |
| L-08 | [预警/翻转各一次；室内与 F2 不受淹；保留干路](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L356) | M2/M6-D/E | 未实现 | 待对应阶段实现提交与用例 |
| L-09 | [至少一条永久合法撤离路径；任务物可达](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L357) | M2/M6-D/E | 未实现 | 待对应阶段实现提交与用例 |
| S-01 | [容器余量、层与角色库存对应同一成功检查点](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L363) | M0/M2/M6-E | 未实现 | 待对应阶段实现提交与用例 |
| S-02 | [完整回滚/保护；成功后只换层一次](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L364) | M0/M2/M6-E | 未实现 | M0原型局部证据：[M0决策](M0-STATE-AND-COMPAT.md#5-专项复现与证据)；正式用例待对应阶段提交 |
| S-03 | [前/后分别恢复对应层；未提交恢复最近成功点](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L365) | M0/M2/M6-E | 未实现 | M0原型局部证据：[M0决策](M0-STATE-AND-COMPAT.md#5-专项复现与证据)；正式用例待对应阶段提交 |
| S-04 | [面板内不切层、不转移；关闭后新按下可切层](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L366) | M0/M2/M6-E | 未实现 | 待对应阶段实现提交与用例 |
| S-05 | [成功交易保留；失败交易双端回滚；不部分保存](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L367) | M0/M2/M6-E | 未实现 | 待对应阶段实现提交与用例 |
| S-06 | [冲突保护阻止覆盖，两端进度不被悄悄重置](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L368) | M0/M2/M6-E | 未实现 | M0原型局部证据：[M0决策](M0-STATE-AND-COMPAT.md#5-专项复现与证据)；正式用例待对应阶段提交 |
| S-07 | [已支持旧档正确恢复；未知/损坏拒绝且留原始字节](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L369) | M0/M2/M6-E | 未实现 | M0原型局部证据：[M0决策](M0-STATE-AND-COMPAT.md#5-专项复现与证据)；正式用例待对应阶段提交 |
| S-08 | [取消保持原档；成功完整恢复；失败保留原档](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L370) | M0/M2/M6-E | 未实现 | M0原型局部证据：[M0决策](M0-STATE-AND-COMPAT.md#5-专项复现与证据)；正式用例待对应阶段提交 |
| S-09 | [仅有效点停稳满 3 秒后写入成功才结算；重试单次发奖](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L371) | M0/M2/M6-E | 未实现 | 待对应阶段实现提交与用例 |
| S-10 | [同一失败规则；安全箱保留；不因跨层绕过终局](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L372) | M0/M2/M6-E | 未实现 | 待对应阶段实现提交与用例 |
| U-01 | [层/区域一致，文字可读，不遮关键操作；查另一层地图不换层](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L378) | M1/M6-C/M7 | 未实现 | 待对应阶段实现提交与用例 |
| U-02 | [点击目标可用，旧输入释放，层正确，面板有出口](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L379) | M1/M6-C/M7 | 未实现 | 待对应阶段实现提交与用例 |
| U-03 | [记录实际机型、系统、浏览器；行为满足前述规则](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L380) | M1/M6-C/M7 | 未实现 | 待对应阶段实现提交与用例 |
| P-01 | [无页面错误；计时/潮汐/终局各一次；帧时间与实体稳定](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L381) | M7 | 未实现 | 待对应阶段实现提交与用例 |
| P-02 | [跨局清理旧实体；下一局无旧尸体/容器；内存无持续累积证据](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L382) | M7 | 未实现 | 待对应阶段实现提交与用例 |
| P-03 | [无运行必需外部请求；普通入口不暴露测试接口](https://github.com/xuys2025/escape-bincov/blob/49738b89cc8556a0b39d339239bf09945e44ab9e/docs/MALL-VALIDATION-MAP.md#L383) | M7 | 未实现 | 待对应阶段实现提交与用例 |

