滨科夫 · 塔科夫界面研究样稿
日期：2026-10-05
基线：xuys2025/escape-bincov main e7252e6a595022212a60bcec22ac75068173e480
状态：整体视觉方向已通过，维护者已选 B（点阵正文与标签）。仍为设计原型，未接入游戏，未发布。

打开 review.html。单文件可离线打开，包含两页界面、字体与物品比例样张、参考依据。
可做：切换整备/搜刮，切换字体，选择物品查看详情，勾选 main 原界面对照。
不能做：出击、交易、拖放、转移、存档。底部动作框仅为排版展示。
界面中的库存、现金和行动状态是演示夹具，不是新玩家初始值。
main 的真实截图和设计稿明确区分；不是把概念稿当成已实现截图。

内容
- gear/loot-hybrid-1280/1920.png：A，黑体正文＋点阵分区短标题（历史对照）。
- gear/loot-pixel-1280/1920.png：B，点阵正文与格子短标签，已选定并设为默认。
- fonts-1280/1920.png：相同 16px 正文和 28px 行高，以及真实占格的物品比例比较。
- baseline-gear/loot-1280/1920.png：main HTML 实际浏览器截图，使用相同物资夹具。
- notes-1280/1920.png：参考依据、版本边界、取舍和下一步。
- review-report.json：原型浏览器检查；不代表游戏回归已运行。
- baseline-report.json：main 与 PR #11 输入 HTML 的确切哈希和截图方法。
- source/：可编辑原型与生成、验证脚本；不是游戏 src/ 的实现。

原型可复现（从仓库根目录，在已安装项目依赖后）
  node docs/tarkov-ui/source/build.mjs
  node docs/tarkov-ui/source/review.mjs
浏览器选择沿用 scripts/browser-options.mjs 和 PLAYWRIGHT_BROWSERS_PATH。

重新获取基线截图与候选物品图（可选；输入必须匹配报告哈希）
  node --import tsx docs/tarkov-ui/source/capture-baseline.mjs <PR-11-09e0713-HTML路径>
当前 main 截图来自 e7252e6 的 dist/index.html；导出的 20 件物品各有 24/32px 两版，
来自待审 PR #11 的 09e0713，未把候选美术当作已接受的 main。
长枪、手枪、净水瓶与急救包另在 prototype.js 中绘制比例稿。
未引入塔科夫游戏资产；第三方参考图仅提供出处，不随本原型重新分发。

字体
- A 正文：Noto Sans CJK SC Regular，TTC 第 2 个面（从 0 起），来自本机字体包。
- 点阵：ChillBitmap 16px Regular，作者 v2.502 下载包，字体内部 Version 1.000。
- 两个修改后的子集分别更名 Bincov Study Sans / Bincov Study Pixel，按 SIL OFL 1.1 使用。
- 来源、哈希、实际字集覆盖与子集大小见 fonts/manifest.json。
- fonts/Noto-COPYRIGHT.txt 保留 Debian 原始版权文档；其中 GPL 段属于 Debian 包装文件，
  字体本身的许可是文档中的 SIL-1.1。ChillBitmap-OFL.txt 保留字体实际归属与完整 OFL。
- Noto 来源：https://github.com/notofonts/noto-cjk
- ChillBitmap 来源：https://github.com/Warren2060/ChillBitmap/releases/tag/v2.502
- Bender 仅为界面字形研究参照，未嵌入或分发。
重新生成字体需要 fonttools 4.61.1 与 brotli 1.2.0，原始字体必须匹配 manifest 的哈希：
  python3 docs/tarkov-ui/source/subset-fonts.py <ChillBitmap_16px.ttf> <NotoSansCJK-Regular.ttc>
生成字体后再次 build，再运行 review。普通浏览样稿不需要上述工具。

参考
1. https://www.heiolenmarkus.com/blog/escape-from-tarkov-menu-ux-redesign
   2020-12-01，区分原版 old 图和作者 new 重设计；本轮参考 old 的 0.12.7 装备结构。
2. https://www.gamefontlibrary.com/games/escape-from-tarkov
   实际查看含 0.16 搜刮与结算的字体标注图；绿色 BENDER 标记是作者注释，不是游戏 UI。
3. https://www.pcgamesn.com/escape-from-tarkov/patch-notes-0-13-5
   2023-08-10，记录交易/任务 UI 改版，避免把旧交易界面声称为当前版本。

尚待讨论与验证
- A/B 的阅读舒适度是样稿观察；没有真人阅读速度或无标签物品辨识实验。
- 未制作手机布局；窄屏允许横向查看桌面研究稿，不声称完成手机适配。
- 未把 RPG-SYSTEM-DESIGN.md 的拟议属性/设施当成已实现功能。
- 本次未改游戏 src、存档、输入或经济规则。pnpm test 的 109 项规则测试通过；
  执行 pnpm package 验证通过，正式 HTML、ZIP 和发布清单与 main 字节一致。
- 选定方向后再制作交易/主菜单/HUD 和真实游戏实现；需完整的库存、搜刮与保存失败回归。

交付基线更新
提交前已同步最新 main 49738b89cc8556a0b39d339239bf09945e44ab9e。
新增的建筑与商场文档仍是设计待实现；游戏源码与 e7252e6 采样基线一致，
原界面截图及报告保留实际采样提交号，不把新文档当作已实现玩法。
