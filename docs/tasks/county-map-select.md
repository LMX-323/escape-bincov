# 县域选图界面（#82）

2026-10-23（UTC+8），基线 `76adbd627f582d063cc6f80a4551e8b8cbe2dddd`，任务分支 `feat/county-map-select`。维护者授权先完成选图界面，未开发地区标「暂未开发」。本次交付不关闭 [#82](https://github.com/xuys2025/escape-bincov/issues/82) 的真实地图、路线、剧情及版本接入待办。

承接 [PR #91](https://github.com/xuys2025/escape-bincov/pull/91)。创建 PR 期间主线合入 #88，随后正常合并 `b38f23d`；源码自动合并，HTML、ZIP 和发布清单由 `pnpm package` 重建解决冲突。同步后 549 单测与 package 再次通过。

## 玩家可见变化

院门 / G / 出击快捷键打开县域战术地图：手绘地形底图、十二个区域标记、出发路线、区域情报与整备检查。沿海街区、滨湾商场可出击；其余十个区域可以查看规划，出击按钮禁用。现有沿海街区占用老城规划位置，情报明确说明完整老城仍待扩展。

选择未开发区域不会沿用上次的可玩地图出击。切图保留行动种子，键盘方向键可切换可玩区域。手机竖屏选择区域后滚至情报，可点「返回地图」；窄屏和矮屏允许滚动到出击按钮。减少动态效果偏好关闭扫描和路线动画。

十二地区仅为展示身份；其 UI ID 不写存档，不分配新的 `worldId/mapId/layoutVersion`：

| 选图位置 | 当前行动 | 状态 |
| --- | --- | --- |
| 老城街区 | 现有沿海街区：`buildings` / `coast-buildings-v1` | 可出击；完整老城待扩展 |
| 滨湾商场 | `mall` / `mall-v3` | 可出击；后续美术扩量归 #47 |
| 县医院、县医院旧址、工厂区、隐秘实验室、西线国道、水产市场、观测站与泵房、灯塔岬角、旧渔港、远汐号 | 无新增行动身份 | 暂未开发 |

## 实现与兼容

- `src/station-view/deploy-map.ts` 维护展示信息；`deploymentWorld` 仍受 `raidWorlds()` 提供的现有白名单约束。`UI.regionPreview` 只在面板中保留，提交前再次验证目标。
- 出发、事务、库存、世界初始化、存档键及旧档恢复均沿用原服务。旧页签备用入口保持原下拉；显式 `?test=1` 仍可制造经典封锁区旧行动以验证恢复。
- `host.ts` 在渲染侧导入底图后传给 UI，纯 Node 测试不载入图片。地图资源、来源、提示词和转码命令见 [素材说明](../../assets/county-map/README.md)。独立 HTML 只增加约 0.32 MB，图片无需网络。
- 字体按既有固定上游 TTF 重新取字集；无新增依赖、CDN、字体网络请求。

## 验证

环境：Windows，Node 24.21.0，pnpm 11.19.0，Chrome 155.0.8059.85。真实页面操作，存档/局内专用回归保留原测试夹具；未做手机真机或真人手感验收。

| 检查 | 结果 |
| --- | --- |
| `pnpm test` | 最终 549/549；接图时发现 Node 测试不接受静态 WebP 导入，把图片导入移至宿主后全量重跑通过 |
| `pnpm package` | 通过；独立 HTML / 两份 ZIP / 发布清单已更新 |
| `pnpm test:raid-default` | 10/10；R10 覆盖十个未开发区域拦截（含强行启用 DOM 按钮）、保留种子、键盘切换、四尺寸标记无重叠/裁切；原两图出击和旧档恢复仍通过 |
| `pnpm test:browser`、`pnpm test:ui` | 通过；两档桌面实际行动与 UI 回归 |
| `node --test scripts/ci/*.test.mjs` | 53/53 |
| `test:desktop-input`、`test:mobile`、`test:mobile-ux`、`test:portable` | 全部通过；移动 UX 未提供固定旧客户端的可选验证，其他断言保留 |
| `test:station` | 77/78；E4「真实有效120秒」单项复查仍失败。诊断 160.5 秒只累计 79.59 秒有效训练；同机 main `b38f23d` 已提交 HTML 对照在 136.01 秒累计 124.14 秒并通过。不能断言是环境波动或主线问题，未放宽断言；其余 77 项通过，无页面错误或外部请求 |
| 完整 GitHub CI | 功能 head `b060afad02c1e5086026cd0ef7c9f73f701452e7` 的 [运行 39929517938](https://github.com/xuys2025/escape-bincov/actions/runs/39929517938) 构建、八组浏览器和汇总检查全部通过；追加交接提交的准确 head / CI 见原 PR 最新正文 |

真实界面截图（新档，无资源/进度修改）：[1280×720](county-map-select/1280x720.png)、[1920×1080](county-map-select/1920x1080.png)、[手机竖屏](county-map-select/390x844.png)。地图底图本身是示意美术，截图中的界面、标签与操作为实际实现。

后续验收在同一 PR 更新；合并与上线需维护者授权。新增区域继续按 #82 的 RG-01～RG-05 推进，不能把县域展示图当作已完成的关卡地图。

## 交给 Opus 的续作入口

维护者追加要求：保留 Opus 的视觉改进空间，补画素材并留下交接。此次补充十二地区情报候选图与接入说明；最终布局、图像取舍、交互深化和转场由 Opus 继续设计。现有界面可以运行，不需要先从零重写。

### 基线与本轮交付

- 仓库 / 分支：[xuys2025/escape-bincov](https://github.com/xuys2025/escape-bincov) / `feat/county-map-select`，继续 [PR #91](https://github.com/xuys2025/escape-bincov/pull/91)，不要重复开同目标 PR。
- 本机工作树：`D:\bincov\county-map-select`。2026-10-23（UTC+8）开始续作时 HEAD 为 `b060afad02c1e5086026cd0ef7c9f73f701452e7`，工作树干净；核对最新已接受主线 `24c18a6f68e3e34bb8684441869f290a10590e69`（#87 搜刮时 WASD 离开）。本轮正常合入该主线，保留其源码与测试，生成物通过正式 package 重建。
- 最终交接提交 SHA 和该 SHA 的 CI 结果记录在原 PR 正文；接手时重新 fetch、检查 `git status` 和 PR 实时状态，不使用这段历史 HEAD 替代实时核对。
- [素材包](../../assets/county-map/briefing-concepts/README.md)：3 张源图集、12 张独立 WebP、完整提示词、裁切与哈希清单、可重跑导出脚本。全部是未接入的概念图，当前 HTML 不因这些候选图增大。
- 本轮没有创建 Opus 聊天或向其他聊天发送任务；把本节交给实际接手者即可。PR 未自行合并或部署。

同步后本地 `pnpm test` **550/550**、`pnpm package`、`pnpm test:raid-default` **10/10** 通过；单文件 HTML 仍约 5.80 MB。选图回归首跑 9/10，R10 在切换视口后等待滚动元素稳定时遇到 DOM 重建而失去目标；布局测量前改为对最新节点同步滚动，未修改游戏行为或放宽任何断言，全量重跑通过。素材导出得到 12 张 768×512 WebP（合计 696,178 字节），3 张源图和 12 张输出哈希核对通过，34 个相关本地链接存在。当前提交的完整 CI 以 PR 最新验证表为准；上方 549 项与 `b060afa` 的记录保留为上一轮证据。

### 留给 Opus 的改进空间

| 顺序 | 建议做什么 | 可以自行设计的部分 | 应保住的验收结果 |
| --- | --- | --- | --- |
| 1 | 为区域情报加入预览图 | 先试商场与灯塔两张，决定图文比例、裁切、选中反馈，再按需要接其他图；素材可替换或再画 | 不遮挡「暂未开发」，禁用区仍不能出击；移动端出击与返回可达 |
| 2 | 优化地图空间与地标关系 | 当前 `object-fit: fill` 会随屏幕拉伸；可以改固定比例图层、合理裁切或缩放/平移，再统一标记与路线坐标 | 1280×720、1920×1080、844×390、390×844 下所有十二节点可达、不互相遮挡；点击目标与图像位置一致 |
| 3 | 完善选中动效和视觉层级 | 地标局部高亮、短暂切换、路线绘制、情报展开方式；先保持克制，避免重加颗粒、噪点和大片光效 | 键盘焦点、种子、返回路径不丢；减少动态效果偏好有效；关闭面板后动画与资源不持续消耗 |

这些是续作方向，不要求全部在下一轮一次做完。维护者明确嫌弃首稿「噪点太多、太 AI」，应优先控制色块、轮廓、可读性和风格一致性。新图以更简洁的第二轮为交付版，仍允许 Opus 调整配色与明暗。不要为了增加视觉内容先做新地图、解锁规则或剧情系统。

### 五个直接入口

1. [素材包 README](../../assets/county-map/briefing-concepts/README.md) 与 `manifest.json`：先看十二张候选图和 ID，选两张试版式。PNG 是源图，WebP 是待接图；只把选定的 WebP 内联进游戏。
2. [deploy-map.ts](../../src/station-view/deploy-map.ts)：`REGIONS`、`countyMapHtml`、`regionBriefHtml` 管展示；`deploymentRegion` / `deploymentWorld` 管预览到现有可玩区域的映射。先改这里的视觉投影，不改变世界白名单。
3. [host.ts](../../src/station-view/host.ts) → [ui.ts](../../src/station-view/ui.ts) → [panels.ts](../../src/station-view/panels.ts)：图片当前由 `StationHost` 导入并通过 UI 选项传入，最后给 `deployHtml`。新增图片沿此渲染边界注入，避免在纯展示数据模块静态导入 WebP 导致 Node 单测报错。
4. [station.css](../../src/station-view/station.css)：末尾 `.county-*` / `.region-*` 负责地图与情报；`UI.input`、点击处理、`showRegionBrief` 负责种子、选中和手机滚动。若改缩放，坐标层与点击层必须同一变换。
5. [raid-default-test.mjs](../../scripts/raid-default-test.mjs)：R10 覆盖十区禁用、DOM 强制启用仍拦截、种子、键盘与四尺寸布局；R1–R9 保留现有出击、历史恢复和触屏路径。视觉变更后跑 `pnpm test`、`pnpm package`、`pnpm test:raid-default`、`pnpm test:browser`、`pnpm test:ui`，新增实际截图；涉及输入再按手册叠加移动/键盘检查。

### 不可误改的行为与已知问题

- `old-town` 只是规划展示位，当前真正可玩的是 `buildings` / 沿海街区；另一个为 `mall`。其余十区保持「暂未开发」，不能通过有图、点亮图标或保存预览 ID 获得出击资格。
- `regionPreview` 仅为 UI 状态；启动前必须继续通过 `deploymentWorld` 和 `raidWorlds()` 白名单。旧沿海行动、历史商场布局、旧页签备用入口和显式测试入口保持可恢复。
- 保留种子、键盘焦点、减少动态效果偏好、手机返回入口、存档事务及单文件离线；没有新的远程素材请求。素材中的水位、建筑与道路不构成未来关卡设计合同。
- 额外 E4 训练检查的失败尚未归因，详见上表与 PR；`pnpm test:station --only=E4 --out=test-results/station-e4` 可复查，不能修改 120 秒门槛来消除失败。它不在此次美术接入的验收范围内，但也不能把正式 CI 通过写成所有额外检查通过。
- 本轮素材通过视觉审阅、尺寸/哈希/链接核对；最终游戏内接图效果、真人喜好、手机真机及新增动效性能尚未验证，留给 Opus 接图后实际检查。

可直接给 Opus 的开工提示：

> 继续 `xuys2025/escape-bincov` 的 `feat/county-map-select` / PR #91。先读本文件「交给 Opus 的续作入口」和素材包，核对最新 main 与 PR head。请在现有县域选图上做视觉深化：优先用商场、灯塔两张候选图试区域情报卡，改善布局与选中反馈，再按效果推广。你可以调整图文、配色、动效和素材取舍，保持低噪点、清晰轮廓。两处现有区域可出击，其他十区保持暂未开发；不新增世界或改存档。按本节验收并更新同一 PR，保留训练 E4 尚未归因的记录，不自行合并或部署。
