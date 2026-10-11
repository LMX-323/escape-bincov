# SOL-R3-CAP-LISTENER-01 · 8/16 能力反复切换后的 sampler 监听

日期：2026-10-12（UTC+8）。工作树 `D:/bincov/cap-listener-fix`，分支 `fix/cap-listener-r3`，从最新 main `1dbacb4`（#36 合并）建立。开工时工作区干净，开放 PR 只有 #28/#30/#31（文档，与本项无关）。本批只处理 [#32](https://github.com/xuys2025/escape-bincov/issues/32) 三级里的 SOL-R3-CAP-LISTENER-01，起点是 Sol 的[遗留清单](../sol-resource-r3-20261011/issues.md)和[采样口径](../sol-resource-r3-20261011/test-diagnosis.md)。只改渲染层 `src/coast-view/renderer-lifetime.ts`，新增一个复验脚本；没有改 Runtime、存档、接口和图片。

## 结论

1. **根因在 Pixi 8.22 的 `DefaultBatcher._updateMaxTextures`。** 批处理纹理数变了以后，Pixi 池里复用的 Graphics 渲染数据会调用它：每次都新建一个 DefaultShader，被换掉的旧 DefaultShader 没有销毁。旧 Shader 本身会被回收，但它的 BindGroup 一直挂在 Pixi 模块级缓存的 batch-sampler 组上（`change` 监听），所以每切换一次能力就多留一个。
2. **测试自身与产品都会触发同一条路径。** C5 的增长全部来自测试 scratch 绘制留在 Pixi 池里的那份渲染数据；院子静止和院子重挂不触发；真实的院子→城中村→院子往返会触发，而且增长更快（见下表）。所以这不是只有测试才有的现象。
3. **已修复。** 整页每个纹理数只保留一个 DefaultShader（采用 Pixi 自己建的那个），批处理器在这几个之间切换。修复后 C5 的 sampler 监听全程 2 个；四种工作负载 GC 后每个监听都能对上一个活着的具体 Shader，修复前留下的“Shader 已回收、监听还在”一项不剩。
4. 程序复用（C1–C4）、实际像素绘制、恢复后的输入与暂停、院子和城中村往返生命周期都保持通过。能力差异只模拟了 `MAX_TEXTURE_IMAGE_UNITS` 查询；真实 8 槽设备和真实驱动能力迁移**未测**。F20 / ASTRA-STATION-HEAP-01 总堆仍 PARTIAL，ASTRA-SAVE-01 仍 UNCONFIRMED，原 R/K 严格失败照旧保留。

## 复现（修复前 main `1dbacb4`）

```bash
pnpm package
node scripts/station-context-program.mjs --html=<1dbacb4 的 dist/index.html> --switch-rounds=6 --out=<目录>
```

本机 Chrome 154 headless、RTX 3070 / ANGLE D3D11，原生 16 个批处理纹理。结果 8/9：S1、S2、P1、C1–C4、R1 通过，**C5 失败**（`repeated capability switch listener growth`）。每次恢复后 scratch 绘制之后的监听数：8 槽 3,3,4,4,…,8,8；16 槽 4,4,5,5,…,9,9，和 Sol 记录的“8 槽 3→8、16 槽 4→9”一致。

## 区分产品持有与测试持有

C5 原有的归属判断只认 graphics 适配器和 BatcherPipe 两类 Shader，Graphics 渲染数据里的 DefaultShader 一律算“未匹配”，所以分不出来。新脚本 `scripts/station-capability-listeners.mjs` 把每个监听（一个 BindGroup）对到注册它的 Shader，再列出这个 Shader 现在的使用者：graphics 适配器、BatcherPipe 批处理器、产品 Graphics 的渲染数据、测试 scratch 绘制的渲染数据（在 Pixi 池里，测试本身不持有）。三次 CDP GC 后再看 Shader 是否还活着。每种工作负载单独开页面，3 轮 ×（8,8,16,16）次真实丢失/恢复。

修复前（`1dbacb4`），每轮结束 GC 后的监听数（8 槽 / 16 槽）：

| 工作负载 | 内容 | 第 1 / 2 / 3 轮 | 多出来的监听属于谁 |
| --- | --- | --- | --- |
| probe | 每次恢复后做 C5 的 scratch 绘制 | 1/3 → 2/4 → 3/5 | 全部是已回收的 DefaultShader，最初都在测试 scratch Graphics 的渲染数据里：**测试引起** |
| idle | 院子不动，不画 scratch | 0/2 → 0/2 → 0/2 | 无增长 |
| remount | 每次恢复后关掉院子画面再进入 | 0/2 → 0/2 → 0/2 | 无增长（这几轮里院子重挂没有复用池里的渲染数据） |
| trip | 每次恢复后真实出击城中村（沿海街区、种子 42）再回院子 | 2/4 → 4/6 → 6/8 | 已回收的 DefaultShader，以及两次采样之间新建又被换掉、没采到使用者的 DefaultShader，都产生于城中村一轮里的渲染数据复用；此负载没有测试绘制：**产品引起** |

16 槽固定的 2 个是院子批处理器与产品 Graphics 共用的那个 DefaultShader 加当前 graphics 适配器 Shader。没有发现测试自身强引用任何渲染对象：页面上只存 WeakRef/WeakMap。

## 根因

- `DefaultBatcher`（`pixi.js/lib/rendering/batcher/shared/DefaultBatcher.mjs`）构造时取模块级的 `defaultShader`，没有就按自己的纹理数建一个。所有批处理器借用同一个 Shader，`DefaultBatcher.destroy` 只把引用置空，不销毁它。
- `GraphicsContextRenderData.init` 从 BigPool 取出渲染数据时调用 `batcher._updateMaxTextures(当前纹理数)`。只要和这个批处理器的 Shader 不同，就 `new DefaultShader(n)`，即使这个数已经有过一个；被换掉的那个不销毁。它还不更新批处理器自己的 `maxTextures`。
- DefaultShader 的资源是 `getBatchSamplersUniformGroup(n)`，这个 UniformGroup 按纹理数缓存在模块里，永不释放。Shader 构造时建的 BindGroup 在它上面登记 `change` 监听，只有 `Shader.destroy()` 才会撤销。于是旧 Shader 被回收，BindGroup 留在监听表里。
- 同能力恢复不经过这条路径，所以同能力反复恢复监听不变；只有能力真的改变、随后又有渲染数据从池里复用时才增长。

## 修复

`src/coast-view/renderer-lifetime.ts` 第 3 项（院子和城中村共用，在第一次 `Application.init` 之前生效）：

- 整页一张表，每个批处理纹理数一个 DefaultShader。第一次遇到 Pixi 已建的 Shader 时收进表里，之后不再新建同数的 Shader。
- `_updateMaxTextures(n)`：批处理器的纹理数和 Shader 一起改成 n（Shader 从表里取）。
- `begin()`：批处理器的 Shader 和自己的纹理数不一致时（能力切换后新建的批处理器，构造函数给的是 Pixi 最早那个 Shader），先换成表里对应的那个。
- 这几个 Shader 由整页持有，和 Pixi 原来的模块级 Shader、按数缓存的 sampler 组一样不随渲染器释放；数量受实际出现过的纹理数限制，每个都有明确身份（复验脚本逐个检查）。graphics 适配器的 Shader 仍在每次 contextChange 新建，旧的照旧 `destroy(false)`。
- Pixi 没有替换 DefaultBatcher 的扩展点（BatcherPipe 和 GraphicsContextRenderData 都直接 `new DefaultBatcher`），所以改的是它的原型方法；Pixi 内部方法不存在时跳过，复验脚本会失败提醒。没有改 `node_modules`，没有清空全局缓存或重建 Application。

## 验证

本机 Windows 10、Node 24.19.0、pnpm 11.19.0、Chrome 154 headless、RTX 3070 / ANGLE D3D11、1280×720（另注明除外）。修复后构建 `dist/index.html` sha256 `2320bd31…88231`；修复前对照用 `1dbacb4` 的打包结果 `af97b2a2…95f0`。

| 检查 | 修复前 `1dbacb4` | 修复后 |
| --- | --- | --- |
| `station-context-program.mjs --switch-rounds=6`（`--reference` 为修复前报告） | 8/9，C5 失败：监听 8 槽 3→8、16 槽 4→9 | 9/9：24 次切换后监听全程 2；两个 graphics 程序复用；C4 两种能力源码与修复前 Pixi 编出的相同；R1 世界画面非空、键盘行走 |
| `station-capability-listeners.mjs`（4 种工作负载） | 2/4：probe、trip 失败（已回收 Shader 留下监听、同数多个 DefaultShader、每轮监听不同）；idle、remount 通过 | 4/4：每轮 GC 后 8 槽 ≤1、16 槽 2，不随轮数增长；每个数只有 1 个 DefaultShader，均存活；只剩当前 graphics 适配器 Shader；院子画面非空、可行走。remount 的 8 槽比修复前多 1 个：能力为 8 时重挂新建的批处理器改用 8 数的 DefaultShader（修复前沿用最早的 16 数那个），之后不再增长 |
| 单元测试 `pnpm test` | — | 292/292 |
| `pnpm package` | — | 通过；两次打包 ZIP 与发布清单字节一致 |
| 院子 `test:station` | — | 76/76，页面错误 0、外部请求 0 |
| 城中村生命周期 `coast-lifecycle-test.mjs` 1280 / 1920 | — | 各 5/5：启动清理与重试、普通上下文丢失后原生恢复（丢失期间冻结、恢复后保持暂停直到继续）与结算、Runtime 时间冻结与释放 |
| 城中村样板 `coast-sample-test.mjs` | — | 51/51，错误 0、外部请求 0 |
| 完整 CI | — | 见 PR |

精简结果见 [evidence/summary.json](evidence/summary.json)。复验脚本修复后的院子截图：[trip 工作负载结束时](evidence/trip-after.png)。

## 复验入口

```bash
pnpm install --frozen-lockfile && pnpm package
node scripts/station-context-program.mjs --switch-rounds=6 --out=<新目录>          # C5 原断言未改
pnpm test:station-capability --out=<新目录>                                          # 归属，约 4 分钟
# 失败对照：先在 1dbacb4 打包，另存 dist/index.html，再给两条命令加 --html=<该文件>
```

两条命令都需要原生 16 个批处理纹理、支持 `WEBGL_lose_context` 的真实 WebGL，和 `station-context-program` 一样只在本地运行，没有接入 CI。

## 未改与未测

- 只模拟了能力查询，绘制、丢失与恢复都是真的。真实 8 槽设备、真实驱动在恢复时改变能力、手机真机都没有测。
- 另见一处 Pixi 原有行为，本批未改：BatcherPipe 已为某个指令集建好的批处理器在能力变化后保持创建时的纹理数和 Shader。模拟环境里 GPU 实际有 16 个单元，画面正常；真实降级设备上是否出问题未测，不在本项范围。
- F20 / ASTRA-STATION-HEAP-01 总堆仍 PARTIAL，原 R 四项和 K3/K4 严格失败、ASTRA-SAVE-01 UNCONFIRMED 均不改签。Sol 原报告和历史证据未改。
- 当前 agent 独立完成，没有派子 agent。
