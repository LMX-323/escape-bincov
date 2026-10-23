# 县域选图底图

由内置 OpenAI `image_gen` 生成，经过三轮编辑压低碎纹理、简化森林与建筑、去掉文字；完整提示词序列见 [prompt-final.txt](prompt-final.txt)。维护者要求减少首稿的噪点与 AI 概念图感，本次采用统一平涂地图。

- `county-terrain-source.png`：最终源图，1536×1024；地景为选图示意，不是可游玩地形或关卡平面。
- `county-terrain.webp`：相同尺寸的 WebP，质量 0.88，250,704 字节。由 `node scripts/prepare-county-map.mjs` 转码，无裁切、拼接或重新绘制。
- `manifest.json`：源图和运行时图的 SHA-256、尺寸与转码环境；构建检查哈希。

地图标签、开发状态、路线、扫描效果与点击区都由代码绘制。WebP 经 esbuild 内联为 data URL，游玩无需外部请求。源图只用于维护，不重复塞入 HTML。未采用的草稿保留在本地忽略的 `test-results/county-art-drafts/`。

## 给 Opus 的追加素材

[briefing-concepts/](briefing-concepts/README.md) 提供十二地区的情报插图候选、三张原始图集、逐图裁切/哈希清单与完整提示词。它们供视觉深化选择，尚未被游戏导入；概念插图不表示实际关卡已经实现。[续作交接](../../docs/tasks/county-map-select.md#交给-opus-的续作入口) 说明接入位置、保留的行为及验收入口。
