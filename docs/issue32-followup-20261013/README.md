## 2026-10-13 最终收尾复验

原 head e11552c 的[完整 CI 已成功](https://github.com/xuys2025/escape-bincov/actions/runs/38342364197)，此前“CI仍运行”是交接时快照。本轮继续原 PR #43，正常合入 main 95036af，双方剧情与资源交接均保留。

Windows / Node 24.19.0 / pnpm 11.19.0 / Chrome 155.0.8059.40 串行复验：295/295单测、严格TS及打包通过，重新构建的HTML、ZIP、manifest与原PR逐字节一致。资源专项1280×720、1920×1080各5/5，动画6/6，页面异常与外部请求为0。见[单测](evidence/closeout/unit.log)、[打包](evidence/closeout/package.log)、[1280](evidence/closeout/targets-1280.json)、[1920](evidence/closeout/targets-1920.json)、[动画](evidence/closeout/animation.json)。

宽屏首轮4/5：点击“继续”紧接按住D，按键会落在Runtime恢复发布前，并被关闭暂停面板的suppressHeld抑制；界面正常恢复，角色没有移动。[首败](evidence/closeout/targets-1920-first-failure.json)保留。专项现等待正式running状态及暂停面板关闭，再发新的真实按键；未改产品、移动距离断言、超时或资源门槛。修后两尺寸各5/5。

当前交付为可审阅的原PR续作，最终提交完整CI状态见PR。#32仅更新本次资源空槽和动画采样子项；F20总堆、原R/K整体、自然帧率、SAVE/A6、真机与其它范围保持原状态。

# #32 续作：城中村渲染目标释放与动画验收采样

日期：2026-10-13（UTC）。唯一基线：`origin/main` `3f706b77e9b924b0cee085e79c54479a0c19da65`；任务分支 `fix/issue32-validation-followup`。#42 已合并，本次独立承接它保留的资源调查和自动验收维护；开放 #28/#30/#31/#39/#40/#41 的分支及范围保持原归属。

维护者明确授权本次自行验证、修复、验收后经 PR 合并，最后更新 #32；没有直接推送 main。实施、验证和独立代码复核分别进行，实际结果记录于下文。

## 资源缺陷与边界

城中村 `CoastView.resize()` 会替换 `worldRT`、`lightRT`、`upRT`。旧纹理和它们的 GPU 对象已销毁，但 Pixi 的 `glTexture` 管理表仍留着对应 uid 的 `null` 槽。调整窗口、切换视野和 WebGL 恢复都进入该路径；只在离开场景时清表无法约束一次长行动内的累积。

未修改的 main 正式包中，暂停后通过浏览器真实调整视口 20 次，空槽从 **0 增至 60**，每次增加三个。逐 uid 核实其 source 已销毁、GPU 数据已释放、新目标仍在正常使用；页面异常为 0。这是管理记录累积的证据，不能写成已确认 GPU 纹理泄漏，也不能据此解释 F20 的全部堆增长。

修复沿用院子已使用的 `releaseManagedSlots`，只删除当前 view 刚销毁的三个 source uid 且值为 `null` 的槽；活动槽、其他对象的空槽、共享资源及其他管理表保持原归属。`resize()` 与最终 `destroy()` 共用释放函数。存档、玩法规则、动画、素材和离线运行方式不变。

首轮结算检查发现另一条既有持有链：`renderer._lastObjectRendered.renderGroup.instructionSet.instructions[0].textures.textures[0]` 留着最后一帧的 `upRT` source（已销毁）。有/无 `extract.pixels` 两个独立对照都复现，因此不是像素读取独有的污染。首轮 4/5 的报告保留；后继验收明确检查停放时 source/GPU 已销毁、槽已移除，以及下一次真实场景渲染后对象回收，不能声称停放瞬间所有 JS 对象均回收。该有限边界与 F20 总堆结论分开记录。

## 动画检查的采样口径

旧 V03 在真实帧回调内同步读回 GPU 像素，读回和截图自身会增加后续帧间隔，160ms 的倒地动画可能只有一帧可观察。修正后的 V03 分开记录无像素读回的自然帧，并用明确的 `1/60s` 显示步长检查真实击杀事件、倒地旋转、武器隐藏、尸体交接和六帧实际像素。受控采样证明动画契约，不代表自然帧率或硬件性能通过；自然采样原值单列，不冒充原自然帧数门槛通过。

旧 V10 在施加打击后等待一个不确定时长的 rAF 才读红边，正常衰减会先把脉冲降到阈值以下。现在在事件显示时采样，然后另验单次脉冲自然消退；持续伤害不闪白等原断言保留。动画专项支持独立分组运行，默认完整检查仍保留原用例。V09 和院子的原固定时窗性能失败不通过降低阈值解决。

## 可复验命令

环境：Linux 云容器、Node 24.19.0、pnpm 11.19.0、Playwright Chromium 153.0.8010.12，使用软件渲染。不是手机、真实 GPU 或真人体验验收。

```bash
pnpm test
pnpm package
pnpm test:coast-render-targets
pnpm test:coast-render-targets --wide
node scripts/coast-sample-test.mjs --group=animation
node --import tsx scripts/coast-lifecycle-test.mjs
```

原包 HTML SHA-256：`ff9b6e5f1a652b7932ec62173e53e29e3ccfbd6015a3993108b44c0081d19c42`。修复包：`322fa384857004baa4f30a806b2667c360dd299dd49f09b6bc8ac6345052da78`。两个 HTML 字节一致，ZIP 与 manifest 由 `pnpm package` 更新。

## 验收结果

首败、原版对照、变异负对照和最终结果分开保留，不用重跑通过覆盖失败记录。

| 检查 | 实际结果与证据 |
| --- | --- |
| `pnpm test` | 30 个测试文件全部通过；本环境默认 reporter 按文件汇总，[原 head CI](https://github.com/xuys2025/escape-bincov/actions/runs/38342364197) |
| `pnpm package`、制品校验 | 严格 TS 与打包通过；两个 HTML 一致，4 个 manifest 哈希/大小、两 ZIP 的 CRC 与入口 HTML 字节均核对通过，[原 head CI](https://github.com/xuys2025/escape-bincov/actions/runs/38342364197) |
| 资源专项，旧 main 包 | **2/5**，前三组准确检出旧目标 uid 的 null 残留；像素/键鼠及结算往返原本通过，[负对照](evidence/targets-baseline.json) |
| 资源专项，1280×720 | **5/5**，[逐 uid 报告](evidence/targets-1280.json) |
| 资源专项，1920×1080 | **5/5**，[逐 uid 报告](evidence/targets-1920.json) |
| 首轮资源专项 | **4/5**，停放最后一帧 source 未即时回收；[首败](evidence/targets-first-attempt.json)、[有像素读取引用链](evidence/parked-extract-owner.json)、[无像素读取引用链](evidence/parked-no-extract-owner.json) |
| 原动画采样，固定旧 main 包 | **2/5**，V03 两种画风各 1 个自然倒地帧，V10 脉冲为 0.27；V04 两种原本通过，[原样对照](evidence/animation-baseline-original.json) |

修正采样在未改产品字节的旧 main 包上 **6/6** 通过，[报告](evidence/animation-baseline-corrected.json)。两种画风的受控倒地均 9 帧，自然采样仍为 1 帧，`meetsOriginalMinimum=false`；V10 事件脉冲 0.414，1.2 秒后为 0。该结果只签动画状态/像素与事件显示契约，自然性能缺口仍保留。

维护者要求尽快收尾：本地不再扩展重跑旧院子、完整默认 51 项样板和广泛浏览器矩阵。原失败记录与未测边界保持；PR 的完整 CI 将执行既有全部门禁和新增两个专项。最终新包动画、独立负对照及 CI 状态以本 PR / #32 的最新验收记录为准。

每种尺寸均有 20 次真实视口调整、12 次视野切换、6 次原生 WebGL 恢复。前 114 个退休纹理/source 在独立 GC 检查中全部回收；其当前空槽均为 0。精准清理控制另外制造一个真实的无关 null，12 次视野切换后仍保留；其他六表条目逐身份不变。结算后宿主、view、Texture 已回收，下一宿主渲染后最后三个 source 也全部回收。

恢复后实景（测试仅摆位及冻结 AI，实际渲染、输入和暂停）：[1280×720](evidence/restored-1280.png)、[1920×1080](evidence/restored-1920.png)。已目视核对世界、HUD 和暂停控件，没有用概念图代替实现截图。

## #32 剩余范围

- F20 / ASTRA-STATION-HEAP-01 总堆仍为 **PARTIAL**。原 R/K 严格失败不整体改签，只收口本次确认的城中村已销毁渲染目标空槽。
- ASTRA-SAVE-01 和 R7-A6-01 仍 **UNCONFIRMED**；常规回归与故障注入不是历史根因证据。
- 院子固定时间帧数/有效训练时间、V09 自然动画帧数及其他未复验项保留原结果。
- 购物车摆位规则、跨窗口继续旧交易、人物及场景素材、沿海预警接口与扩量、昼夜等仍待明确规格或原任务安排。
- 真机、原生 GPU/驱动、真实切窗旋转、长时间游玩与平衡仍未验收。
- #42 已完成商店具体拒绝提示与本页清单刷新、冷 PNG 失败恢复、SOL-F20-HUD-01；#32 正文应补齐这些状态，但不能勾选仍含未完成工作的整行。

#32 总 issue 保持开放。PR 合并与 main 的 Pages 部署分别核验。
