# 滨科夫界面字体

`bincov-text.woff2` 是寒蝉点阵体 16px Regular 的游戏字符子集，按 SIL OFL 1.1 分发。子集化后更名为 **Bincov Text**，遵守上游保留名称；不是另一个自行创作的字体。

上游：[Warren2060/ChillBitmap v2.502](https://github.com/Warren2060/ChillBitmap/releases/tag/v2.502) 的 `ChillBitmap_New.zip`，内部 `ChillBitmap_New/ChillBitmap_16px.ttf`（字体自身 Version 1.000）。TTF SHA-256：`9c699de0d24e482700fa0a08ce3abe58ef2ceaf6173323c77b767c72cd538512`。归属和完整 OFL 文本保留在 [LICENSE.txt](LICENSE.txt)，也内嵌于独立 HTML 的第三方声明。

构建读取已提交 WOFF2，不需要 Python 或网络。`scripts/font-characters.mjs` 保守收集所有 src TS/CSS 非 ASCII 字符及完整可打印 ASCII，构建时检查提交字集是否覆盖；动态用户文字仍回退到系统字体。新增未覆盖文字时，下载上述固定上游文件后重新生成：

```bash
python3 -m venv /tmp/bincov-font-build
/tmp/bincov-font-build/bin/pip install fonttools==4.61.1 brotli==1.2.0
/tmp/bincov-font-build/bin/python scripts/subset-font.py /path/to/ChillBitmap_16px.ttf
pnpm package
```

提交 WOFF2、字符清单和 manifest。脚本校验上游哈希、更名 name 表、保留版权/许可元数据并验证 cmap；游戏采用原生 16px 及整数倍字号。短小辅助文字继续使用系统字体以保持可读性，不把 16px 点阵任意缩到 9–12px。
