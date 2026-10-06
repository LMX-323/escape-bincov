# 主菜单像素分层素材

2026-10-07 更新。本目录同时保留早期程序素材和当前导入素材；**运行时以 `src/title/assets.ts` 和 schema 2 的 `manifest.json` 为准**。旧 `title-*.png` 不再自动覆盖新图。

当前室内、桌台、船、港口、灯和绳索采用本任务生成并进行运行检查的像素素材（整体美术尚未获用户认可）；雾、雨、光点及电台精灵沿用程序素材。图层全部内联到离线 HTML，不需要联网。不能再沿用“全部程序绘制、没有生成图”的旧来源说明。

## 来源与派生

- 当前空间返修使用 `sources/*-depth-v2.png`：椅子、桌台、船与远港由内置 ImageGen 依据同一已认可概念生成。首轮提示词见 `sources/depth-v2-prompts.md`，桌台最终二次修订提示词见 `sources/desk-depth-v2-refinement.txt`。前三者准备为对应 `title-*-depth-v2.png`，远港准备为天空/港口两张 ready 图。`*-new.png` 中被替换的原素材继续保留，但不进入运行包。

- `*-new.png`：2026-10-07 第三轮分层交付。原始生成图、提示词和交付清单位于本地 `设计提案/主界面重做-20261006/layers/`；仓库保存实际运行需要的 PNG。
- `sources/wordmark-industrial.png`：本轮通过内置 ImageGen 生成的独立中文工业字标。准确文本为“逃离／滨科夫”；提示词见同目录 `wordmark-prompts.txt`。运行版缩至 144×66，最近邻采样后使用单色旧白和二值透明，避免柔边与浮雕效果。
- `title-sky-ready.png`、`title-harbor-ready.png`、`title-room-ready.png`：从当前对应源 PNG 延展边缘像素，覆盖视差边界。透明补边不能代替画面延展。
- `title-wordmark-industrial.png`：独立字标的运行版。正文继续使用 Bincov Text，字体来源与 OFL 许可见 [字体说明](../fonts/README.md)。
- `title-pier-occluders-new.png`：位于船与船水关系之上的近码头遮挡，不能省略。
- `src/title/water.ts`：从船体真实轮廓采样，绘制吃水边缘、暗水、受波纹打断的船影和局部反光；不是另一张不透明背景。

## 图层与验证

逻辑坐标为 960×540。位置、景深和帧数见 [layout.ts](../../src/title/layout.ts)，文件尺寸、来源、SHA-256 和 RGBA 像素哈希见 [manifest.json](manifest.json)。

绘制顺序：远背景 → 不透明港口底图 → 水面与船影、雾和远灯 → 船 → 吃水线 → 系船绳 → 近码头遮挡 → 雨 → 室内 → 吊灯 → 桌台与灯光 → 椅子 → 前景。

`pnpm title:art` **只写七张派生 PNG 和清单**，不会重新绘制或覆盖 `*-new.png` 源图。旧绘制模块保留供历史参考及程序效果复用。

```bash
pnpm title:art
node --import tsx scripts/title-art/generate.ts --check
pnpm test
pnpm package
pnpm test:title
pnpm test:title-water
```

构建校验所有运行时 PNG 的完整清单、尺寸及哈希。单元测试同时验证真正导入的图片、门窗透明度和不透明视差边缘。修改源图后须先审核差异，再更新派生与清单；不能只改哈希消除失败。

主界面最终审美仍由用户确认；通过像素/运行测试不等于与概念图完全一致。当前实装证据见 [主界面交付记录](../../docs/title-parallax/README.md)。
