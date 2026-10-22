# 改枪美术规格（M0-09，草稿，未完成）

**状态：WIP。2026-10-22 因停电中断，只保存了调研事实和初步方案。** 正文、Sol 任务书、README 行都还没写完，不能当作已定规格。

## 已核实的现状（main `2bac4fb` / 本分支 `bf0a6c4`）

- 持枪图：`assets/coast/manifest.json` 每张有 `w`、`h`、`anchor`、`grip`、`muzzle`、`sha256`、`revision`。卡宾 31×10，grip (8,4)，muzzle (28,4)；手枪 18×10，(6,6)/(16,3)；霰弹 33×10，(11,6)/(31,2)；盐枭步枪 31×10，(10,7)/(29,3)；守潮人步枪 35×12，(10,8)/(33,4)；匕首 19×8；棍 24×10。Alpha 只有 0/255，每张 7–11 色，手套画在枪图上，朝东。
- `src/coast-view/art/sol.ts` 的 `HELD`：grip、tip、forward、support、oneHanded；`solWeapon` 返回 pivot、forward、muzzle、support。没有 Sol 图时用 `art/actors.ts` 的 `paintWeapon`（程序画）。#39 的样本 M4A1 外观是 `rifle`，玩家没有对应 Sol 图，实际用程序画的 31×10 步枪。
- `scene.ts`：`barrelTip()` 从像素读最右一列的中点当枪管尖；`syncActor` 用 `barrelTip().y - pivotY` 把枪管行对齐到胸口瞄准线；`muzzleOf()` 给火光和曳光起点；`heldLength()` 随朝向缩短；`syncArms()` 按 support 摆前手。#39 决定子弹从身体中心出生、射程补 17 px，视觉枪口只管表现。
- `textures.ts`：武器缓存键 `weapon:<WeaponLook>:<kind 或手套色>`，加 `|rim`；`Atlas` 小图打进 2048 页，只能整体 `destroy()`，只有大于 512 的独立纹理能 `drop`。
- 物品图都是程序画：`paintItem` 24/32 方图（列表、详情、HUD 武器卡 2 倍、地面 24 px 加光晕 28×27）；`paintInventoryItem` 按 `inventoryArtSize`：长枪 78×17、手枪 38×17、2×1 物品 48×16、默认 24×24。`item-images.ts` 的 `painted()` 缓存 data URL，无上限。
- `scripts/build.mjs` 只校验 coast 图的 sha，站点、商场、开场还校验 PNG 宽高；整包大小只打印，不设上限。当前单文件 5,720,996 B。
- `scripts/coast-import-assets.mjs` 只能替换已有 id，读 `width/height` 字段，而近两次 Sol 交付写的是 `w/h`；新增素材应照 `scripts/mall-assets.mjs` 的生成方式。
- `test:art` 要求每种物品 24/32 图、格子图、地面图各自唯一。

## 初步方案（待写完）

- 三种输出：持枪 1 倍（1 像素 = 1 世界像素）；库存图约为持枪长度的 2.5 倍（对齐卡宾 78×17）；工作台按 3–4 倍另画。地面沿用按枪型的方图，配置只在格子图、工作台和手里显示（待维护者确认）。
- 枪拆成机匣与原厂件分层，配件按挂点叠加；手套单独盖章，最后画。旧三枪按原图切层，原厂配置重新拼出必须逐像素等于已验收图。
- 组合在 Canvas 2D 里做（上下文恢复时可重新上传），键含枪型、配置、素材版本、手套/kind；不预生成 20×100。
- 配件图标建议交 PNG，每件一张 24×24，32 px 场景按 RPG 物品先例居中。
- 预算方向：改枪全部 PNG 原始字节设上限，构建时汇总检查。

## 下一步

1. 写完 ART-SPEC 正文（挂点表、缓存契约、预算数字、交付规则、分批验收、待定问题）。
2. 写 `D:/bincov/工作标准/PR28排期-20261022/Sol-改枪样板素材任务书.md`。
3. 在 `docs/gunsmith/README.md` 表格加一行。
