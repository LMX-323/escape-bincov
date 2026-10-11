# PR #34：水产站计数与护符快照

2026-10-11，继续原工作树 `fix/ai-tier1-station`。接手 HEAD `3c21622`，fetch 核对 main `fc2a1d34c3097b8070e2e8d76d0526b4c56d2286`，PR head 与本地一致，工作区干净，有原分支写权限。本轮由当前 agent 一次完成；没有派工或新开 PR。

## 改动与兼容

- T1-01 / OPUS-STATION-COPY-01：院子 HUD、电台面板、旧页签水产站统一显示「累计出击 N 次」，读取 `profile.stats.runs`。新档为0，旧档7次保持7；统计仍在成功提交出击时增加一次。
- T1-02 / ASTRA-STATION-API-01：`HideoutSnapshot.charm` 是只读、可为空的已佩戴物品副本，来自已提交会话；桌面/窄屏整备读取同一快照。删除 route → StationHooks → UIHost 的专用护符回调。
- 保留现有雨夜画面、布局、技术方案、`day = runs + 1` 兼容字段、存档键和版本。没有更改佩戴/替换/取下规则、效果、负重、物品归属或持久化交易；替换的旧护符仍退回新护符的来源容器，取下仍回仓库。
- 增加3项领域边界测试和10步 `pnpm test:station-tier1`；专项进入 CI world 组，不改变原检查与发布门禁。

## 本地环境与实际验证

Windows，Node 24.19.0，pnpm 11.19.0，使用系统 Chrome；浏览器完整版本与制品 SHA 记录在[专项报告](evidence/final/tier1-browser.json)。现有 Node22 / pnpm11.25 默认 PATH 未用于验收；选择本机已存在的 Node24/corepack11.19，frozen-lockfile 安装通过，依赖与 lockfile不变。

| 检查 | 结果与证据 |
| --- | --- |
| pnpm test | 278/278；[最终日志](evidence/unit-final.txt) |
| pnpm package | 类型检查、字库覆盖、两个 HTML 和 ZIP 通过；[日志](evidence/package-first.txt)、[发布清单](../release-manifest.json) |
| pnpm test:station-tier1 | 10/10，页面错误0、外部请求0；[报告](evidence/final/tier1-browser.json) |
| pnpm test:hideout | 8/8；[报告](evidence/final/hideout.json)、[日志](evidence/test-hideout.txt) |
| pnpm test:station | 76/76，页面错误0、外部请求0；[报告](evidence/final/station.json)、[日志](evidence/test-station.txt) |
| pnpm test:save-browser | 9/9；[报告](evidence/final/save-browser.json)、[日志](evidence/test-save-browser.txt) |
| pnpm test:browser | 通过，两尺寸18张截图；[报告](evidence/final/browser.json)、[日志](evidence/test-browser.txt) |
| pnpm test:ui | 通过，桌面两尺寸布局检查；[报告](evidence/final/ui.json)、[日志](evidence/test-ui.txt) |
| pnpm test:portable | 实际解压 ZIP，file 离线运行与操作通过；[原始输出](evidence/test-portable.txt) |
| 回归退出码 | 六套均为0，运行起止时间见[原始结果](evidence/regression-results.json) |
| 原构建负对照 | 同一最终脚本跑 main fc2a1d3 的原 HTML，0/10、10项预期失败；[报告](evidence/baseline/report.json)、[日志](evidence/baseline/output.txt) |
| 最终 CI | 推送后核对当前 head 的完整检查，结果与 run 链接更新在[原 PR #34](https://github.com/xuys2025/escape-bincov/pull/34)；准备提交的 CI 不作为本次证据 |

专项用打包 HTML、真实 Runtime / SaveSession / localStorage；普通新档无测试接口。旧档7次、护符库存、存储配额故障是明确夹具；鼠标/触摸动作走真实控件。覆盖三个入口、刷新与切换不改统计、出击写入失败保持7、成功提交变8且动画中刷新不重计；护符为空、佩戴/替换/取下、旧页签提交、刷新恢复、副本修改隔离、原字节/库存回滚、重试不自动佩戴及单次物品身份守恒。

## 真实实现截图

截图由上述生产构建实际运行取得，没有原型/概念图。普通新档使用正常入口；7次统计和护符是标明的存档夹具。390×844 为 Chromium 触屏仿真，不能代替真手机。

| 视口 | 计数（三入口） | 护符整备 |
| --- | --- | --- |
| 1280×720 | [HUD](evidence/final/seven-hud-1280.png)、[电台](evidence/final/seven-radio-1280.png)、[旧页签](evidence/final/seven-tabs-1280.png) | [已佩戴](evidence/final/charm-gear-1280.png) |
| 1920×1080 | [HUD](evidence/final/seven-hud-1920.png)、[电台](evidence/final/seven-radio-1920.png)、[旧页签](evidence/final/seven-tabs-1920.png) | [已佩戴](evidence/final/charm-gear-1920.png) |
| 390×844 | [HUD](evidence/final/seven-hud-390.png)、[电台](evidence/final/seven-radio-390.png)、[旧页签](evidence/final/seven-tabs-390.png) | [已佩戴](evidence/final/charm-gear-390.png) |

已目视核对桌面两尺寸和窄屏的计数与护符名称；DOM另检查文字在视口内、无溢出裁切，package检查内联字库的代码点覆盖。[普通新档0次](evidence/final/ordinary-zero-1280.png)、[旧页签佩戴后](evidence/final/old-tabs-charm.png)、[替换写入失败](evidence/final/quota-bag.png)、[取下写入失败](evidence/final/quota-remove.png)。

## 失败原样保留

1. [首轮单测](evidence/unit-first.txt) 277/278：新增测试错误假定安全箱替换护符会把旧物品退回仓库；实际既有规则退回安全箱。只修测试对容器的断言，保留原字节、库存和身份守恒检查，产品交易规则未改。文本副本仅去除两处行末空格以满足 Git 空白检查；[完整原输出及校验值](evidence/unit-first-raw.json)可无损还原，原本地日志未覆盖。
2. [首轮专项](evidence/failures/browser-first.json) 4/10：[日志](evidence/browser-first.txt)及6张失败截图保留。打开电台/整备后快捷栏按现有设计隐藏，脚本直接调用页签快捷入口而超时；另一次失败重试后320ms内再次点物品，被现有双击快捷转移规则处理。脚本改为先真实关闭面板再切页签，并明确隔开两个单击；没有删断言、动作失败重试或改产品交互。
3. 原构建负对照：同一最终脚本、相同断言，运行保存的 main fc2a1d3 原 HTML（SHA256 `112e7c8e37c91a218351b2fee03c008872bee5ca563d4262e431a57a845c5ef1`），10项均预期失败，页面错误和外部请求均0。旧 HUD 新档显示「第1天」、旧档7次显示「第8天」，旧页签固定「第17天」；正式快照没有 charm，因此对应空值/身份断言失败。修复后10/10通过，首轮脚本操作错误另列，不能混为产品首败。保留[旧电台桌面](evidence/baseline/seven-radio-1280.png)、[旧电台窄屏](evidence/baseline/seven-radio-390.png)、[旧页签](evidence/baseline/seven-tabs-1280.png)和原报告。
4. 接手默认沙箱 Git 因工作树所有者不同报 dubious ownership；只对本工作树传safe.directory，不改全局信任或钩子。默认全局ignore不可读是环境提示，不清理用户文件。提交、推送前仍运行原本地密钥检查。

## 交付与遗留

本轮只更新 #32 对应两个一级子项，总 issue 保持开放。二三级状态、历史内存F20 PARTIAL、监听增长、历史SAVE/A6未确认、真机/真人/GPU验收均不变。本轮没有重新跑60轮资源专项或10分钟自然玩法；未改变这些区域。PR审阅通过后由维护者另行决定合并；不自行合并、发布或开启下一轮。
