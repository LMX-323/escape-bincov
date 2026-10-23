# #75 受击闪白与抖动的慢帧证据

分支 `fix/hurt-flash-slow-frames` 的本地实测（2026-10-23，Windows，本机 Chrome 156.0.8078.48）。修复说明见 [handoff](../../../handoff.md) 当日条目。

| 文件 | 内容 |
| --- | --- |
| [check-g-main.json](check-g-main.json) | `test:shooting` 检查 g 在 main 构建上的报告（`44494ea` 的 `dist/index.html`，blob `af888ec`）：60/30/15 帧/秒闪白与抖动为 4/2/1 帧，12、10 帧/秒均为 0 帧，检查失败 |
| [check-g-fix.json](check-g-fix.json) | 同一检查在本分支构建上的报告：60/30/15/12/10 帧/秒为 4/2/1/1/1 帧，逐帧序列在 60/30/15 帧/秒与 main 相同，检查通过 |
| [hurt-flash-crops.png](hurt-flash-crops.png) | 游戏渲染结果（`upRT`）裁图：main 与本分支在 10、60 帧/秒下，命中那一帧及其后各帧的同一个敌人 |

裁图与检查 g 的做法相同：种子 42，冻结 AI；在当前批次的副本里把一个存活敌人放到玩家东侧 64 像素，送一次子弹向东飞的 `blow` 命中；停住 ticker，按固定帧间隔调用 `present()`。每帧从 `upRT` 裁出敌人周围 56×64 世界像素，放大 3 倍。裁图脚本是一次性的，没有提交。
