# Q-E08 · 按风险选检查与诊断分类

2026-10-23（UTC+8），承接 [#60](https://github.com/xuys2025/escape-bincov/issues/60)，分支 `agent/quality-checks`，基线 `04736f7d6d23e70a7407200ac7a7ecf3947f76e4`。#90 已完成诊断 bundle 同源，本次处理剩余检查导航、脚本用途和输出冲突。新交付独立于 #81 敌人、#91 县域选图，不修改游戏源码、存档、测试阈值或 CI 浏览器分组。

## 当前结果

- [检查导航](../CHECKS.md)：`pnpm checks --risk=save,input` 列出基线与去重后的相关检查、原命令、CI/手动归属、夹具和人工证据。支持 JSON 和全部脚本分类。未知/空风险、混用纯文档与代码风险均失败；不执行命令、不自动跳测。
- 命令来自 package，分组与现有手动原因来自原 `browser-suites`；用途、前置、风险关系在 `check-catalog`。新增 `check:ci` 由工作流调用，实际仍为原有全量 CI 单测 glob。
- 172 个脚本已盘点：44 个检查入口、18 个 CI 工具/测试、10 个诊断、15 个辅助模块、24 个工具、5 个历史工具、56 个待确认。后两类保留源码，未宣称它们都已失效；当前证据不足的工具不自动进入回归。
- `check:perk-ui` 为已有 Perk 专项补 package 手动入口。其是否纳入 CI 留 #61，现有分组不变。
- 两个行动堆探针仍各自保留原跟踪/零所有者差异与断言；默认报告目录分开，显式环境变量覆盖保留。`astra-r7-f20` 继续原 strict60 默认值。所有诊断结果边界在导航显示。
- R6 音频对照归历史工具：#90 的相同源码测量也出现越过 ±20% 门槛。保留原代码和阈值供追溯，不把旧实验升级为现役门禁。R3 两个固定 HTML 的压缩名分析链、旧商场兼容实验同样明确历史前置。

## 本次验证

Windows、Node 24.21.0、pnpm 11.19.0、本机 Chrome 155.0.8059.85；浏览器使用本地离线打包页与原显式夹具。制品与诊断摘要见 [q-e08-evidence.json](../checks/q-e08-evidence.json)。

| 检查 | 结果 |
| --- | --- |
| `pnpm test` | 647/647 通过 |
| `pnpm check:ci` | 62/62 通过，含新增 6 项清单/风险/CLI 守卫；最终交付前再核对 |
| `pnpm package` | 通过；两份 HTML、两份 ZIP 和清单与基线 Git blob 完全一致 |
| CLI / JSON | 存档＋输入组合、迁移前置、全部脚本/历史筛选正常；拼错风险、空选择、隐藏必跑项等反例拒绝；pnpm silent 的 JSON 实际可解析 |
| `pnpm check:perk-ui` | 14/14 通过，覆盖院子/旧页签事务、两档桌面尺寸和触屏视口；不是手机真机验收 |
| `pnpm diagnose:coast-heap` | 原默认 20 轮，exit 0、所有者无残留、canvas 8→8；堆趋势 +348,710 B，memorySignoff 仍 PARTIAL |
| `pnpm diagnose:coast-owners` | 随后单独运行原默认 20 轮，exit 0、所有者无残留、canvas 8→8；堆趋势 +329,182 B，memorySignoff 仍 PARTIAL；两份报告独立保留 |

未运行严格 60 轮、全部历史工具、真机/真人平衡；上述两轮只验证命令与输出，不替 #32 F20 归因或签收。游戏字节不变，无新增玩家可见行为或画面截图要求。CI 以承接 PR 的准确 head 为准，提交不代表合并或上线。

## 续作入口

1. 修改检查关系或前置：`scripts/check-catalog.mjs` 的 `risks` / `checksFrom`，同时保持风险组合和负对照。
2. 处理待确认工具：`pnpm checks --scripts --kind=review`，逐项核对后更新 `script-inventory`，不凭命名删除。
3. #61 调度研究消费相同元数据；是否把手动套件移入 CI 仍需独立运行证据。
4. #32 F20 从原报告继续归因；本次没有改任何内存判定条件。
