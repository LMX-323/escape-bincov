# 🚀 GitHub Pages 发布与维护

| 项目 | 地址或配置 |
| --- | --- |
| 仓库 | https://github.com/xuys2025/escape-bincov |
| 正式试玩 | https://xuys2025.github.io/escape-bincov/ |
| 源码分支 | `main` |
| Pages 来源 | Settings → Pages → Build and deployment → GitHub Actions |
| 工作流 | `.github/workflows/ci-pages.yml`（CI & Pages） |
| 发布目录 | `dist/`；入口 `index.html` |

游戏是静态单人程序，没有游戏服务器、登录或数据库。试玩只发布 `dist/`，不会把源码、测试或开发文档当成网站根目录。所有样式、脚本、程序画面与声音内联，不依赖仓库绝对路径。

## 自动更新

1. 从最新 `main` 建立分支，修改 `src/` 或相关构建代码。
2. 运行 `pnpm test`、`pnpm package` 和对应浏览器检查；提交源码与同步生成物。
3. 发起 PR。**Build and test** 执行规则、构建、双分辨率、存档与离线检查，PR 不部署正式站点。
4. 维护者合并后，`main` 触发同样验证。只有通过后才执行 **Deploy Pages**。
5. 在 Actions 与 `github-pages` 部署记录看到成功，再打开试玩网址检查主菜单、出击、操作及存档。

`workflow_dispatch` 可由维护者手动重跑当前 `main`；其他分支即使手动运行也不会部署。工作流不需要个人访问令牌，验证仅用 `contents: read`，部署作业仅用 `pages: write` 和 `id-token: write`。

## 离线与网页包

- `release/Escape-Bincov-portable.zip`：完整游戏及中文游玩说明。
- `release/Escape-Bincov-web.zip`：根目录 `index.html`，用于其他静态托管。
- `docs/release-manifest.json`：`pnpm package` 自动生成文件大小和 SHA-256。
- ZIP 使用固定时间戳，避免单纯重打包产生无意义的二进制变化；HTML 是玩法和界面的构建结果，不手动编辑。

## 存档与链接

浏览器本地存储按 origin 隔离，不会自动从 `file:` 迁移到 `https:`。旧版离线用户先在原路径升级到支持备份的 HTML，用原浏览器导出，再进入在线版导入。换域名或浏览器也应先导出。

同一 GitHub 账户的项目 Pages 通常共用 `https://xuys2025.github.io` origin。本游戏使用独立存档键 `escape-bincov.save.v1`；其他项目不要复用该键。同源路径变化不提供存档隔离，不要未经评估在该 origin 部署会读写此存储的不可信脚本。

## 失败与回退

- 安装失败：查看包源及固定版本，不删除 lockfile 来碰运气。
- 浏览器检查失败：下载 `browser-evidence`，检查截图和报告；不得绕过验证直接发布。
- Pages 未启用：在 Settings → Pages 确认来源为 GitHub Actions，检查工作流部署记录。
- 部署成功但页面旧：核对提交与 Pages 部署时间，再刷新；不要先清除玩家浏览器存储。
- 正式版本需要回退：创建回退提交的 PR，重新构建并验证后合并；不要 force-push `main`。
- 存档格式已经迁移时，先评估旧程序能否读取新数据，不要盲目回退。

## 网络范围

GitHub Pages 是当前试玩入口；其在中国大陆的实际可达性和速度需在电信、联通、移动网络分别测试。未进行大陆三网测试时不能宣称“国内稳定直连”。可以下载离线包，也可按 [大陆在线游玩指南](ONLINE-CHINA.md) 在其他静态托管上部署同一构建。

参考：[GitHub Pages 自定义工作流官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
