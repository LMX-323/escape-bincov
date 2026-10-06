# PR16 实施验证证据

2026-10-05，2026-10-06补充专项。Linux、Node.js 24.19.0、pnpm 11.19.0、无头 Chromium 153.0.8010.12。代码基线 main `49738b89cc8556a0b39d339239bf09945e44ab9e`；完整玩法源码提交 `375680497185ad97ec068b0fc064d2501bfa43e6`，树 `da36d9dfba3dcedbc02c10b5dc6034a3db920a13`。后续提交补充测试脚本、证据与文档，运行包未变。

最终两份 HTML 均为 1,797,467 字节，SHA-256 `76cc5602c730de38235846e9b6610a103bf004798cdf4626fb4ced1a9dd3122b`；ZIP 哈希见 [发布清单](../../release-manifest.json)。报告原样保留测试方式和夹具说明。浏览器处于离线上下文；所需环境权限不代表游玩时联网。

## 实际报告

| 命令 | 报告与覆盖 |
| --- | --- |
| `pnpm test`，另按实际用例统计 | [规则结果](rules-report.txt)：165用例、0失败；原海岸回归保留 |
| `pnpm test:expansion` | [5流程](expansion-browser-report.json)：真实旧 main HTML、所有权、原字节备份、旧端拒绝v4、备份与待结算 |
| `pnpm test:buildings` | [7流程](building-browser-report.json)：门保存故障、居民楼上下与地下、长按抑制、刷新、室内270/300秒边界与超时结算失败重试、两触控尺寸 |
| `pnpm test:systems` | [16流程](systems-browser-report.json)：基地实际移动、五设施付款、有限生产、离线恢复、护符、双固定箱拖放、面板输入抑制、成功搜刮后切层失败/重试/刷新、4组楼梯各10次往返、四终局及结算故障重试、普通离线商场入口 |
| `pnpm test:mall-passages` | [7开口](mall-passages-report.json)：慢走/冲刺各10次往返，共140次往返、280次穿越，含斜向贴边 |
| `pnpm test:mall-landing` | [落点堵塞](mall-landing-report.json)：13个候选全堵时不切层，清开一个后成功，旧移动/瞄准/攻击/E长按五秒抑制 |
| `pnpm test:layered-play` | [正常计时三局](layered-play-report.json)：超时600.156秒、死亡109.331秒、撤离57.878秒；0页面错误/0HTTP请求，与最终HTML哈希一致 |
| `pnpm test:portable` | [解压普通入口](portable-report.json)：新中文/空格路径、原生出击/攻击/撤离、无测试接口、无HTTP请求 |
| `pnpm test:expansion-benchmark` | [容量实测](expansion-benchmark.json)：M0合成三图负载、20/1000弹丸，各60样本；约32/129KB，不代表实际商场帧率或手机性能 |

规则统计使用 `node --import tsx --test --test-isolation=none tests/*.test.ts`；默认 `pnpm test` 按文件隔离，其20个文件入口不等于只有20条用例。完整旧浏览器、存档、库存、桌面、标题、移动和离线回归以最终头的 [PR检查](https://github.com/xuys2025/escape-bincov/pull/16/checks) 为准。

2026-10-06的室内专项显式把行动时钟置于270/300/600秒边界前，由真实帧触发预警、翻潮与终局；敌人冷却延长以隔离计时/事务。F2污染不增、来源层本地时间保持冻结，终局写入失败保留原字节和候选，重试只提交一次。该专项不是另一次正常600秒长测。故障注入按背包、楼层或终局候选选择目标写入，允许无关的周期检查点，避免把检查点暂停误当成终局失败。

## 真实实现截图

截图来自原生渲染和实际UI；为稳定核对文字与输入，一部分使用材料资金、受损身体、注册锚点定位及敌人长冷却夹具。它们不证明正常路线耗时、真人平衡或原参考图还原度。

| 场景 | 1280×720 | 1920×1080 |
| --- | --- | --- |
| 基地与身体属性 | [截图](rpg-base-1280x720.png) | [截图](rpg-base-1920x1080.png) |
| 居民楼二楼 | [截图](building-f2-1280x720.png) | [截图](building-f2-1920x1080.png) |
| 商场二楼露台 | [截图](mall-terrace-1280x720.png) | [截图](mall-terrace-1920x1080.png) |

| 触控仿真 | 844×390 | 640×300 |
| --- | --- | --- |
| 基地菜单与行走控件 | [截图](base-touch-844x390.png) | [截图](base-touch-640x300.png) |
| 商场地图与楼层按钮 | [截图](mall-touch-844x390.png) | [截图](mall-touch-640x300.png) |

另有 [正常计时露台](mall-natural-terrace-1280x720.png)（只读观察与真实键鼠，无状态夹具）、[普通入口商场](mall-ordinary-1280x720.png)、[西入口](mall-passage-P-W-1280x720.png)、[露台北开口](mall-passage-P-TN-1280x720.png)、[全堵落点](mall-landing-blocked-1280x720.png)、[清开一站位](mall-landing-clear-1280x720.png)。

[居民楼二楼超时保存失败](building-indoor-timeout-error-1280x720.png)展示真实F2界面、00:00计时和保留候选的重试/备份控件；使用上述边界与故障夹具。

## 长测采样边界

第一局帧p50/p95/p99为33.3/66.7/99.9ms、最长283.4ms；第二局33.3/33.4/50.1ms、最长550ms；第三局33.3/33.4/50.0ms、最长133.4ms。测试时存在并发无头浏览器负载。四次切层从输入到下一次观测289–381ms，包含浏览器通信/帧等待，不等于内核纯计算耗时。不能据此声明60fps或物理手机性能合格。

每局返回菜单等待30秒后纹理47、子节点2、粗粒度堆23.1MB一致。三局采样没有持续增长证据，不足以排除长期泄漏。首局主要在F2露台等待至570秒再返回，实际跨层完成时599.192秒并自然超时；这是完整正常计时证据，不是已完成R-M探索路线的耗时证明。

## 验收限制

逐条边界见 [73项登记](../../PR16-ACCEPTANCE-REGISTER.md)。原两张参考图不在本轮输入/仓库中，无法确认轮廓精确还原；iPhone/Android物理设备、真人平衡和完整R-S/R-M/R-V路线计时未验收。部分更广的同坐标层隔离与全部故障/双窗口/备份组合未逐一录制。通用声望和奖励规则已实现，具体阵营剧情、地图事件内容、黑市货单按原规范留后。PR保持Draft，未合并main或部署Pages。
