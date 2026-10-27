# M2 素材交付

2026-10-27，按 [TASK](TASK.md) 的顺序开始 P0 店铺批次，继续 [PR #127](https://github.com/xuys2025/escape-bincov/pull/127)。本次是素材交付与注册；布置表仍选程序绘制件，游戏里尚未换图。P1、P2、P3 与其后的建筑缺口继续待做，不把 P0 记成整个 M2 完成。

## 本批内容

![实际导出 PNG 的 3 倍预览](p0-overview.png)

共 58 张本体、6 张发光遮罩，全部为 1 倍 PNG，alpha 只有 0/255。每种连排外观都有 `end-w`、`end-e`、`mid-a`、`mid-b`、`single` 五段。

| 外观组 | 数量 | 画布 | 碰撞 |
| --- | --- | --- | --- |
| 靠墙货架 pharmacy / grocery / phones / hardware / clothes | 25 | 32×80 | B |
| 柜台 service / diner / boutique / wood | 20 | 32×56 | M |
| 玻璃柜台 | 5 本体 + 5 emit | 32×58 | M |
| 油炸线 | 5 | 32×56 | B |
| 售货机 | 1 本体 + 1 emit | 32×72 | B |
| 快餐桌与四张圆凳 | 1 | 64×52 | M |
| 南北向收银通道 | 1 | 32×88 | M |

- 文件在 [`assets/mall/m2-p0/`](../../../assets/mall/m2-p0/)，ID 前缀为 `mall-prop-`、后缀为 `-v1`。例如 `mall-prop-shelf-wall-pharmacy-end-w-v1`、`mall-prop-glass-case-single-emit-v1`。
- [manifest 修订 5](../../../assets/mall/manifest.json) 保存尺寸、占地、lift、南边锚点 `[0, h]`、碰撞类别、emit ID、来源矩形和 SHA-256。原有 110 项的条目与 PNG 不变。`src/coast-view/mall-assets.ts` 由原有生成器注册全部 174 项。
- B 类柜体投影填满画布与占地；不加地面或外投影。每种外观共用最多 28 色。连排开口两列逐行一致，保留外端收口。
- [逐段和连排预览](p0-contact-sheet.png) 左侧为 1 倍独立图，右侧为实际 PNG 以 2 倍拼接；上方总览为 3 倍。两图都是本批导出资产的像素预览，**不是游戏内实现截图**。
- 任务书称“25 种”，但家具表与 `PAINTED_LIFT` 实际各有 26 种；本批依表交付 7 种类型、14 种外观，不据标题漏掉任一项。

## 原图与可重复导出

创作使用内置 **image_gen**，共 14 张原始图集/单件图，保留在 [`assets/mall/sources/m2-p0/`](../../../assets/mall/sources/m2-p0/)。[完整提示词与参考图角色](p0-prompts.json)、[原图哈希和外观共用调色板](p0-sources.json) 随交付保存。没有使用 CLI/API fallback。

导出只做确定性的裁切、最近邻采样、顶面/正面基准对齐、硬透明、共用调色板及接缝归一。柜台端头原图有偏高围板，普通段从密集台面行裁切；单件保留收银机。售货机灯条比一个缩小采样间隔窄，导出时在对应像素区域保留原图实际存在的最亮灯像素。发光遮罩只提取本体已有的亮色灯条，没有外部光晕。

从仓库根目录运行：

```bash
node docs/mall-2-5d/m2/export-p0.mjs
node scripts/mall-assets.mjs
node docs/mall-2-5d/m2/validate-p0.mjs
```

验证器独立读取 PNG 字节，逐项核对哈希、尺寸、alpha、调色板、占地/lift/锚点、B 完整覆盖、遮罩与本体重合，以及 33 对开口接缝。旧清单对照固定为接手的 PR head `60a0d938753baf12eeaa376bcf333668e0dc44cd`；浅克隆需要先取得这个提交。

## 本次实际验证

接受基线 `origin/main` 为 `0d208570ab35d3a4b9da1e25fedbaf83268867c6`；接手 PR #127 head 为 `60a0d938753baf12eeaa376bcf333668e0dc44cd`。在 `C:/bincov/test-results/mall-m2-art` 的隔离工作树交付，原工作树与其他分支不动。

| 检查 | 结果 |
| --- | --- |
| 原图 / 导出 PNG / 接缝 / 锚点等合同 | [通过](p0-validation.json)：14 个原图哈希、64 张交付、110 张原有素材、6 个有效遮罩、33 对接缝 |
| `pnpm test` | 921/921；首跑沙箱账号的 `os.userInfo` 报 `uv_os_get_passwd ENOMEM`，正常宿主账号重跑通过 |
| `pnpm package` | 通过，含 TypeScript 严格检查；HTML SHA-256 `d4d513ed07f35abc031a56f9c07f106f9254fa55421833ea2af358d5aff1552c`；生成物未提交 |
| `pnpm test:mall-sample` | 23/23，无错误/外部请求；含 1280×720、1920×1080 和资源重挂；检查现有程序绘制路径，不替新素材游戏内视觉签收 |
| `git diff --check` | 通过 |
| CI | 推送后的准确 head 以原 PR 检查为准；本地通过不能代替 CI |

Windows、Node 24.22.1、pnpm 11.19.0、Chrome 156.0.8078.48。没有改布局、碰撞、存档格式、状态事务或玩家进度；没有新依赖或游玩网络请求。

## 接手与剩余

1. `src/coast-view/mall-dressing.ts`：P0 对应 `furniture:` 项改选本批 ID；按邻居选择端头/中段/单件，并保留程序绘制后备。M 类现有 `PAINTED_BASE` 需按实际图中底座复核；B 类不能继续沿用售货机旧的窄底座。
2. 玻璃柜台与售货机选择同名 `-emit-v1`，确认宿主按本体位置叠加遮罩。
3. 跑 `pnpm test`、`pnpm package`、`pnpm test:mall-sample`，在 1280×720 与 1920×1080 留真实接入截图；检查灯光、像素密度、家具/人物比例、遮挡和落地线。当前浏览器回归仅证明原路径继续工作。
4. 维护者确认游戏内观感；再按 TASK 的 P1 → P2 → P3 交付后场/办公、服装/儿童区、室外/地面。外立面、检修核顶面、专用楼梯/扶梯与可选招牌均未交付。
