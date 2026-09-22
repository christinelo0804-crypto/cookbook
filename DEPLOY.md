# 部署说明与检查清单

本目录由 `node scripts/build-deploy.mjs` 生成，**不要直接在这里改代码**；
改动请回到项目根目录修改，然后重新生成。

构建时间：2026/9/22 13:01:14
Service Worker 缓存名：`my-family-cookbook-202609220501`

## 一、部署方式（三选一）

### 方式 A：Netlify / Vercel（最简单）
1. 把整个 `deploy/` 目录拖到 Netlify Drop，或连接 Git 仓库并把发布目录设为 `deploy`；
2. 无需构建命令，纯静态站点；
3. 部署后会得到一个 https 地址——Service Worker 与"添加到主屏幕"要求 https（或 localhost）。

### 方式 B：GitHub Pages

**B-1 只发布成品（最简单，推荐）**

1. 在 GitHub 新建仓库（免费账号需要 public 仓库才能用 Pages）；
2. 在本机项目根目录执行，把 `deploy/` 里的文件推到新仓库根目录：

```
node scripts/build-deploy.mjs          # 先生成最新的 deploy/
cd deploy
git init && git add -A
git commit -m "部署我家菜谱"
git branch -M main
git remote add origin https://github.com/<用户名>/<仓库名>.git
git push -u origin main
```

3. 仓库 → Settings → Pages → Source 选 **Deploy from a branch**，分支 `main`、目录 `/ (root)`，保存；
4. 等 1–3 分钟（Actions 页可看进度），访问 `https://<用户名>.github.io/<仓库名>/`；
5. 回到 Settings → Pages，确认 **Enforce HTTPS** 已勾选（Service Worker 必须 https）。

**B-2 源码仓库 + 自动发布（长期使用推荐）**

仓库里保留源码，`.github/workflows/pages.yml` 会在每次推送时自动生成 `deploy/` 并发布：

1. 把**项目根目录的全部文件**推到仓库（`deploy/` 已在 `.gitignore` 中，无需提交）；
2. 仓库 Settings → Pages → Source 选 **GitHub Actions**；
3. 之后每次 `git push` 自动构建发布，也可在 Actions 页手动触发。

**GitHub Pages 的三个注意点**

- Pages **不支持自定义响应头**，静态资源默认缓存 10 分钟（`max-age=600`）。刚部署完可能最多 10 分钟才被浏览器重新拉取；应用是"网络优先 + 缓存名带构建时间戳"，刷新即可拿到新版，若没变化等几分钟或硬刷新。
- 项目站点地址是**子目录形式**（`https://<用户名>.github.io/<仓库名>/`）。本项目资源全为相对路径、`manifest` 的 `start_url` 为 `./`，已适配子目录，无需改动。
- 数据存在浏览器 IndexedDB，**按域名隔离**：线上站点与 localhost 的菜谱互不相通。迁移请在本机「我的 → 导出备份」，再到线上「导入数据」。

### 方式 C：自己的服务器 / 对象存储
1. 把 `deploy/` 里的文件上传到站点目录（可以是子目录，如 `/cookbook/`）；
2. 确保 `index.html` 是目录默认文档；
3. 如果服务器支持自定义响应头，建议按下面设置缓存。

## 二、建议的缓存响应头（可选）

    # index.html 与 sw.js 不要缓存，保证能拿到新版
    /index.html
      Cache-Control: no-cache
    /sw.js
      Cache-Control: no-cache
    # 带内容的静态资源可以长缓存
    /vendor/*
      Cache-Control: public, max-age=31536000, immutable
    /icon-*.png
      Cache-Control: public, max-age=31536000, immutable

## 三、部署后检查清单

- [ ] 用手机 Safari 打开线上地址，七个页面都能正常打开（首页 / 菜谱 / 详情 / 编辑 / 记录 / 我的 / 统计）
- [ ] 地址栏是 https（不是 http）
- [ ] 「添加到主屏幕」，从桌面图标打开：全屏、图标是新的橙色图标
- [ ] 断网后打开应用：仍能使用（Service Worker 缓存生效）
- [ ] 新建一条菜谱 → 关闭再打开：数据还在
- [ ] 上传照片（拍照 / 相册）→ 保存 → 点封面能看大图
- [ ] 打半星评分 → 保存 → 统计页数字正确
- [ ] 「我的 → 导出备份」能下载 `.cookbook` 文件；再导入回来数据完整
- [ ] 设置里切换字号（标准 / 大 / 特大），文字确实会变大
- [ ] 更新验证：改一处文件重新生成并部署，再打开应用能看到新版（首次打开可能会自动刷新一次）

## 四、更新应用的正确流程

    # 1. 在项目根目录改代码
    # 2. （如需改主题色）改 theme.json 后运行
    node scripts/generate-theme.mjs
    # 3. 重新生成部署目录（会自动给 SW 缓存名打时间戳）
    node scripts/build-deploy.mjs
    # 4. 把 deploy/ 重新上传 / 推送

## 五、出问题时怎么办

- 页面打不开或样式错乱：确认目录里的 `vendor/` 一起上传了（Dexie、JSZip 是本地依赖）；
- 看不到新版：清一次浏览器该站点的「网站数据」，或换个浏览器验证；
- 菜谱丢失：菜谱存在浏览器的 IndexedDB 里，清「网站数据」会丢；用 `导出备份` 的文件可以恢复；
- 想回滚：把上一版 `deploy/` 重新上传即可（数据在用户浏览器里，不受影响）。
