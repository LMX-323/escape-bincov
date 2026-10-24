# EN-04：正式街区扩量预算

当前协议 `enemy-native-performance-v1`，入口 [enemy-performance.mjs](../../scripts/enemy-performance.mjs)。先 `pnpm package`，在本机无其他测试负载时运行 `node --import tsx scripts/enemy-performance.mjs`。报告与六张截图写入 `test-results/enemy-performance/`。这项诊断返回非零表示采样错误或预算阻塞；不能把进程完成当作通过。

## 采样边界

使用种子 42 的正式街区 25 人名册，保留首三类拾荒者及全部其他原生敌人。合法存档只改变玩家观察位置和初始潮位；保存后由严格解码器复核。没有新增敌人、冻结 AI、无敌、清空弹药或加速时钟。观察点距枪手 240 像素，从 24 个方向选择与其他敌人距离最大的合法点，保证实际视线和身体可站立。Node 对可见最近敌人用正式输入射击、每三秒请求换弹；桌面通过鼠标瞄准可见最近敌人并每 250 毫秒点击；触屏通过真实 CDP 触摸拖动右摇杆外圈连续射击，期间正常请求换弹。

Node 顺序测低/高潮 × 60/20/5 Hz × 两次，每次 12 模拟秒；记录当前层/全世界人数、真实 `advance` 和 `Runtime.path` 调用次数及耗时。路径测量包住实例方法，不改寻路结果；`dryRefuge` 内的直接 `spacePath` 不计入路径分项，但其耗时仍计入 `advance`。20/5 Hz 有意聚合更多子步，不用 60 Hz 单帧 CPU 阈值判它们；路径单次阈值仍适用。历史行为 A/B 继续原 `bench:enemy` 协议，不被本协议替代。

浏览器在 1280×720、1920×1080、844×390 触屏仿真下分别测两种潮位。每例先预热 30 帧，再真实等待 12 秒，采样 rAF 间隔、宿主 `advance` / `present`、攻击阶段、纹理页及估算字节。若暂停、死亡或未观察到攻击，样本不能签收。记录实际 Chromium/WebGL renderer，`present` 仅为 CPU 提交耗时，纹理估算不是驱动实际显存；触屏仿真不是手机实测。页面错误和外部请求均须为零。

## 首次测量前固定的扩量门槛

这些是本机桌面扩量的初始上限，未达到时先诊断，不能测完后提高阈值以制造通过。

| 项目 | 门槛 |
| --- | --- |
| 全世界敌人 | 仍为 25，替换已有成员，禁止额外出生 |
| 60 Hz Runtime advance | p95 ≤8 ms，p99 ≤16 ms |
| Runtime.path 单次 | p95 ≤4 ms，最大 ≤16 ms |
| view present CPU 提交 | p95 ≤8 ms，p99 ≤16 ms |
| 真实 rAF 间隔 | p95 ≤33.4 ms，p99 ≤50 ms |
| 纹理 | atlas ≤3 页，当前 view 的纹理估算 ≤96 MiB |
| 单文件 HTML / 便携 ZIP | ≤8 MiB / ≤5 MiB |

首轮扩量只允许每局新增一个不超过四人的编组、替换原名册成员；总新原型人数不超过七人。候选点、出生/撤离/门梯安全距离、高潮绕行、旧行动保存与人口校验必须继续通过。扩量前后使用同环境同协议测量，除上述绝对门槛外，advance / present 的 p95 不得上升超过 20%；低于 0.5 ms 的基线使用 0.5 ms 作分母，以免定时噪声主导比例。不同 renderer 或设备不得直接套用同比。

本机预算通过后仍需 EN-21 的真手机、实际 GPU 与真人识别/平衡验收。首轮实测见下。

## 首轮结果：2026-10-24

源码主线整合提交 `92cff64`，未提交改动仅为本诊断与文档；HTML SHA-256 `7872a7fa3912e90ef326338e80c9db9aec9ec697a542037e034d51fd64ab859a`，7,296,351 字节，便携 ZIP 4,693,173 字节。12 个 Runtime 样本与 6 个浏览器样本全部通过，零页面错误/外部请求。原始汇总报告见 [baseline JSON](../enemy-street/performance-baseline-92cff64.json)。

设备为 Windows 10 / Intel Core Ultra 5 230F / Node 24.19.0 / Chrome 155；实际 renderer 为 NVIDIA GeForce RTX 3070 的 ANGLE D3D11。rAF 在此无头浏览器约 6 ms 一次，表中是浏览器回调节奏，不能解读成显示器真正呈现帧率或 GPU 完成时间。

| 尺寸 | 低/高潮 advance p95 ms | 低/高潮 present p95 ms | 低/高潮 rAF p95 ms | 纹理估算 |
| --- | --- | --- | --- | --- |
| 1280×720 | 2.4 / 2.5 | 2.8 / 3.0 | 7.9 / 8.0 | 35.6 MiB |
| 1920×1080 | 2.4 / 2.4 | 3.4 / 3.5 | 8.0 / 8.0 | 39.9 MiB |
| 844×390 触屏仿真 | 2.5 / 2.5 | 3.2 / 3.1 | 8.0 / 7.9 | 31.8 MiB |

60 Hz Node 样本的 advance p95 为 2.41～3.00 ms、p99 2.95～4.19 ms；所有样本单次路径 p95 不超过 0.10 ms、最大不超过 0.28 ms，atlas 均一页。低帧样本按较长子步汇总，保留在 JSON，未冒用 60 Hz 的 CPU 门槛。当前基线允许进行上述有界编组替换，扩量后仍需同协议重测与同比。

首测站定夹具在 4.92 秒死亡，并误用启动回滚清理，结果为 ERROR；修为正常射击输入和正式结算清理。首次触屏用鼠标造成采样无法完成，修为触摸摇杆并加三十秒超时/页面异常捕获。失败日志保存在本地，未计入通过样本。预算未调整。
## 头目据点扩量后的实测

同一设备/Chromium/renderer，当前 HTML SHA-256 `7ba664aeca05ccfc01a27b85c9dd0739be552880529a23cb44bfd1f9a39766f0`，7,297,822 字节，便携 ZIP 4,693,576 字节。标准 seed42 / stationary 协议的 12 Node 与六浏览器样本通过；相对基线的各项 p95 变化为 -11.8%～+10.0%，均在既定 20% 门槛内。原始报告见[独占复测](../enemy-street/performance-market-regression.json)。前一遍标准对照有七秒 CI 守卫重叠，虽返回 PASS，正式记录使用后续独占复测。

额外测 seed45 的六名新原型负载：12 Node 与六浏览器样本通过。使用显式 `--policy=strafe`，正常射击并每秒反向侧移；桌面右键精确瞄准，触屏双摇杆，不使用额外生命、冻结或清敌。浏览器 advance p95 2.5～2.7 ms、present p95 2.8～3.7 ms、rAF p95 8.0～8.7 ms，纹理估算最高 40.9 MiB，atlas 一页。该策略与 seed42 的站定输入不同，只用绝对门槛签收，不作跨输入同比；工具会拒绝不同 policy 的 baseline 比较。原始报告见[六人负载](../enemy-street/performance-market-strafe.json)。

seed45 的首次站定浏览器采样有三例在十二秒内死亡，判为 BUDGET_BLOCKED；保留在本地 `enemy-performance-market-density`，未签收。后续改正常走位取得完整运行样本，绝对门槛未变。这也说明独自站定正面承受整组攻击并不安全；真人战斗难度与提示理解仍待 EN-21。

```powershell
node --import tsx scripts/enemy-performance.mjs --baseline=docs/enemy-street/performance-baseline-92cff64.json --out=test-results/enemy-performance-market-regression
node --import tsx scripts/enemy-performance.mjs --seed=45 --policy=strafe --out=test-results/enemy-performance-market-strafe
```

`--seed` 为 1..UINT32_MAX，默认42；`--policy` 为 stationary/strafe，默认stationary；`--out` 指定独立证据目录。参数、种子、策略、源码/制品及环境写入报告；无效参数/非有限测值、短样本、不同输入、CPU、浏览器或 renderer/DPR 对照直接失败。
## 动物食源样板扩量后的实测

动物批制品SHA `a7aa5f6f6afb7a2c56cbc3a62c92c11c66d71456c603f8c4485452fc83d988e4`，HTML7,299,350字节、便携ZIP4,693,930字节。同一设备/Chrome155/RTX3070 ANGLE D3D11，以下三组独占执行，各12 Node＋六浏览器样本均PASS，绝对门槛未变：

| 组别 | 玩家观察输入 | browser advance p95最高 | present p95最高 | 纹理最高 |
| --- | --- | --- | --- | --- |
| [标准同比](../enemy-street/performance-fauna-regression.json) | seed42、枪手240像素、站定/正常射击 | 2.7ms | 3.2ms | 39.9MiB |
| [七人配置](../enemy-street/performance-fauna-density.json) | seed46、枪手240像素、正常侧移射击 | 2.7ms | 3.8ms | 39.9MiB |
| [动物近距](../enemy-street/performance-fauna-combat-heal.json) | seed46、喷吐兽64像素、正常侧移射击及Q | 3.0ms | 3.7ms | 40.9MiB |

标准同输入p95同比最大+14.3%，低于预先固定20%门槛；负变化不作为提速结论。七人配置与近距组仅以绝对门槛判定，不与不同输入/观察点作同比。近距Q只使用已有随身补给，没有增物、改生命或无敌。

不使用Q的近距补充样本有四个5Hz Runtime及两个触屏例在十二秒内死亡，结果BUDGET_BLOCKED并保留于本地 `enemy-performance-fauna-combat`；它们未签收，失败原因是样本中断。脚本增加显式`--focus`（现有正式原型）、`--radius=32..300`和`--heal=true/false`；默认仍枪手/240/false，旧报告缺字段按原默认解释。对照必须具有相同种子、策略、焦点、距离和治疗输入。

```powershell
node --import tsx scripts/enemy-performance.mjs --baseline=docs/enemy-street/performance-baseline-92cff64.json --out=test-results/enemy-performance-fauna-regression
node --import tsx scripts/enemy-performance.mjs --seed=46 --policy=strafe --out=test-results/enemy-performance-fauna-density
node --import tsx scripts/enemy-performance.mjs --seed=46 --policy=strafe --focus=sac-spitter --radius=64 --heal=true --out=test-results/enemy-performance-fauna-combat-heal
```

这些是实际输入轨迹，正常射击可能提前击杀部分敌人；不代表全员持续同时释放攻击的极限、GPU完成帧率或真机/真人平衡。三种动物的真实释放物理及保存恢复另由生态、扫掠碰撞和酸液反例覆盖。
## 同步 main 4141503 后的包体阻断

2026-10-24 正常合入 #91 县域选图和 #97 命中反馈。此前三组动物性能报告的制品归属不变。重新package后HTML为8,600,598字节、便携ZIP5,655,203字节，超过既定8MiB/5MiB，因此整合制品的包体当前未签收，不能沿用前一制品的PASS。保留固定预算，接着对原素材做像素完全一致的无损图集编码；不降低图片清晰度或移除已合入内容。

### 包体恢复（无损图集）

原始RGBA逐帧核对后生成19图集，HTML7,977,494字节、便携ZIP5,234,907字节，原8MiB/5MiB门槛恢复通过。浏览器透明边缘舍入边界与首败明确记录在[素材记录](enemy-street-art.md)。此前8,600,598/5,655,203字节的未通过结果保留；本节只核销包体，不冒领新CPU/GPU或十分钟结果。
