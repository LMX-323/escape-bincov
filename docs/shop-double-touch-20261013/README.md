# CI-SHOP-TOUCH-01：双触输入与处理时间修复

2026-10-13，新加坡时间（UTC+8）。维护者确认采用 A＋B，并要求在新 PR 实施。基线 main `95036af9b97ef136c874a650a8176f7fd37d6d52`，分支 `fix/shop-double-touch`；关联 [Issue #32](https://github.com/xuys2025/escape-bincov/issues/32#issuecomment-6145429842)。#45 已结束纯文档交付，本次是独立的输入修复；#43/#44 等原任务继续原归属。

## 问题和修复边界

院子库存格在两次同物品 `pointerup` 间隔小于 320 ms 时快速转移。原实现读取处理时的 `performance.now()`，卡帧可使真实快速输入被拆成两次单选，也可使排队的慢输入被误合并。原商店测试等待第一次 `page.touchscreen.tap()` 完成再发第二次，慢 runner 的渲染确认会扩大输入间隔。

修复 A：窄屏商店专项通过同一 CDP 会话依次发出 start/end/start/end，再统一等待四条命令完成。仍走浏览器真实输入管线，检查四个可信 touch pointer 事件的顺序、同物品命中与取消事件；不调用快速转移接口代替点击。报告在成功和失败时都保留未取整的事件时间、捕获/处理时间、目标 UID 与间隔。监听器与 CDP 会话在 `finally` 清理，不加重试，不降低交易或存档断言。

修复 B：`src/station-view/grid.ts` 使用 `e.timeStamp` 比较输入发生时间，保留原 320 ms、同 UID 和快速转移语义；不改存档格式、交易、余额、物品规则、离线入口或院子 ticker。正式 HTML/ZIP/manifest 由 `pnpm package` 更新。

原排查记录中的一处机制描述已校正：锁文件指定 Playwright 1.63，单次 tap 内的 start/end 已并行排队；需要消除的是**两次 await tap 之间**的确认等待。原 CI 首败没有触点时间记录，本地复现与其签名吻合，但不能补造当时帧时间或排除未记录的其他输入故障。

## 能检出旧缺陷的回归

新增两项直接加入已有 `test:shop-feedback`，当前 CI 库存组会执行，无需改工作流：

1. CDP 真实触控输入提供 80 ms 的时间间隔；第二次 pointerup 在产品 handler 前经历真实 450 ms 主线程长任务。检查事件间隔小于 320 ms、处理间隔大于 320 ms，仍恰好入车一件，原存档字节不变。
2. CDP 真实触控输入提供 350 ms 的时间间隔，但四条事件一起排队处理。检查仍是两次单选、购物车为空、第二下高亮和存档不变。这不是实际等待 350 ms 的真机手势；原 `test:station-tier1` 的真实 350 ms 分隔另外回归。

两个时间回归明确使用**原生时钟**，事件仍为 `isTrusted=true`。其他原有拒绝/冲突检查保留固定时钟。Playwright `page.clock.setFixedTime` 不只冻结 Date：它还替换 `Event.timeStamp`，在第一次读取时缓存假的当前 performance 时间。最初固定时钟探针因此未满足事件间隔条件，保留为测试条件调查，不能当作旧产品负对照。[DOM 时间戳规则](https://dom.spec.whatwg.org/#dom-event-timestamp)与本地 Playwright 源码共同支持该区分。

同一新测试脚本对未升级 main HTML 的两项原生时钟负对照都失败：[原始报告](old-native-clock.json)。80 ms 输入、约 451.7 ms 处理间隔时未入车；350 ms 输入、约 2 ms 处理间隔时错误入车。失败均发生在最终产品结果断言，事件顺序、可信输入和时序前提均通过，证明门槛有效。

## 本轮实际验证

本地 Windows，Node.js 24.21.0、pnpm 11.19.0、Playwright 1.63.0、Chrome 155.0.8059.40；CI 使用仓库既定 Node24/pnpm11.19/Chromium，最终 head 结果在 PR 正文登记。首次依赖安装曾使用环境默认 pnpm11.25，锁文件未改；正式测试与打包切到11.19。

| 检查 | 结果与证据 |
| --- | --- |
| `pnpm test` | 295/295，未跳过 |
| `pnpm package` | 严格 TS、离线 HTML 与两份 ZIP 构建成功；两 HTML 一致，manifest 哈希另核对 |
| `pnpm test:shop-feedback` | 新构建 13/13；原11项全部保留，新增两项时间门槛；[报告](shop-feedback.json) |
| 旧版时间负对照 | 0/2（预期失败），准确检出两个旧输入判定缺陷；旧 HTML SHA256 `ff9b6e5f1a652b7932ec62173e53e29e3ccfbd6015a3993108b44c0081d19c42` |
| 24倍降速、GPU关闭、双触/交易阶段 | 2/2；[报告](cpu24-interaction.json)，两个原拒绝案例仍分别验证原因、购物车保留与原档不变；不要求间隔必须是两位数毫秒 |
| 院子相关库存、交易、写失败与四尺寸刷新 | 9/9（C1/D1/D2/F5/H10/H16），[报告](station-scope.json)；无页面错误或外部请求 |
| 原350 ms分隔/护符/失败重试回归 | `test:station-tier1` 10/10，[报告](station-tier1.json)；桌面两尺寸/390×844与旧页签 |
| 存档浏览器与离线ZIP入口 | `test:save-browser` 9/9，[报告](save-browser.json)；`test:portable` 6/6，[报告](portable.json)，普通入口无测试接口、外部请求为0 |
| 准确head完整CI | 推送后登记，未完成前保持Draft |
| 真手机、真人手感 | 未运行；触屏仿真不能代替真机 |

慢环境方法明确限定：页面先在正常速度进入商店、定位商品，随后在保持连接的 Emulation CDP 会话内开启24倍降速，双触及拒绝交易仍在降速下执行。最初把整个启动也降速时，两案例均在原 `page.goto` 15秒超时，保留为[启动压力首败](cpu24-bootstrap-failure.json)；未扩大超时或当作双触失败。另一次探针过早 detach 导致降速重置，仅留本地、不算慢环境通过。最终保持会话的互动压力结果才用于本表。

原院子专项第一次命令因 PowerShell 未加引号的逗号列表变成单一空格参数，实际0/0、不算通过；随后按引号参数运行上述9项全部成功。完整76项院子历史矩阵本轮未重跑，既有性能/资源未完成项不改签。

本次最终产品 HTML SHA256 `e21266f8843b6b7fe82f950794c66fe3fe586cd14fec8145aca55fda3df556ed`。测试脚本修改不改变产品构建；截图使用正式离线 HTML 与现金为0夹具，显示真实拒绝/购物车状态，不是概念图。

## 实景与剩余事项

- [1280×720余额拒绝](funds-1280.png)、[1920×1080余额拒绝](funds-1920.png)、[390×844长任务后的快速入车](quick-after-stall.png)、[390×844两次单选](separate-inputs.png)。
- [旧版长任务负对照](old-quick-after-stall.png)：同一门槛下商品只高亮，购物车为空。
- 不扩大320 ms窗口、不加自动重试或flaky标记；院子降频/暂停的方案C另待明确产品安排。
- #44 的 `F01-double-click-storage-failure-rolls-back` 只是相关线索，尚未重新核实，不能凭本批替其签收。
- Issue #32 总单、原性能/存档未确认及真人真机缺项保持开放。本 PR 等最终CI与维护者审阅，不自行合并、手动部署或更新镜像。
