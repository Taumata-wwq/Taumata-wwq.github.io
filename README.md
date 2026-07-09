# Taumata

个人网站 · 作品集 / 笔记 / 关于页

线上访问：<https://taumata-wwq.github.io/>

## 功能

- **作品展示**：图片画廊、详情页、Lightbox 查看器（拖拽 / 缩放 / 旋转 / 翻转，点击空白处关闭）
- **笔记**：Markdown 渲染、标签分类、创建/修改时间
- **标签系统**：点击弹出相关作品/笔记、跨语言匹配、最多 5 作品 + 3 笔记预览
- **后台管理**：PySide6 桌面应用，可视化编辑作品/笔记/标签/关于页（本地工具，不上传）
- **图片优化**：自动生成 600px 缩略图，Service Worker 缓存加速
- **国际化**：中英文双语，一键切换
- **主题**：明暗模式 + 自定义强调色
- **搜索**：顶部全局搜索框，支持多条件（中英文逗号分隔，AND 逻辑）
- **时间字段**：作品/笔记均支持创建时间与修改时间（可在后台编辑）

## 项目结构

```
.
├── index.html          # 主站入口
├── admin.html          # 后台管理页（需配合本地服务器使用）
├── sw.js               # Service Worker（图片缓存）
├── .nojekyll           # 禁用 GitHub Pages 的 Jekyll
├── .gitattributes      # 行尾规范（bat 用 CRLF，其余用 LF）
└── assets/
    ├── css/            # 样式表（base / pages / admin / theme）
    ├── js/             # 脚本（router / admin / theme / i18n）
    ├── data/
    │   └── projects.json   # 所有数据（站点/作品/笔记/标签/关于）
    └── images/         # 图片资源
        └── thumb/      # 自动生成的缩略图
```

> 本地开发工具（`app.py` / `serve.py` / `optimize_images.py` / `start.bat`）仅用于本地后台管理，不上传到 GitHub Pages，已通过 `.gitignore` 忽略。

## 部署

推送到 GitHub 的 `main` 分支即可自动部署到 GitHub Pages。

```bash
git add <具体文件>
git commit -m "更新内容"
git push
```

> 避免使用 `git add -A` 或 `git add .`，以防误提交敏感文件。

## 数据格式

所有内容集中于 `assets/data/projects.json`，包含：

- `site`：站点元信息（tagline / status / location / timezone 等）
- `about`：关于页内容（title / description / paragraphs / skills / contacts）
- `projects[]`：作品列表（每项含 `datetime` / `createdAt` / `updatedAt` / `images[]` / `tags[]` / `links[]`）
- `notes[]`：笔记列表（每项含 `date` / `createdAt` / `updatedAt` / `tags[]` / `links[]`）
- `tags[]`：标签元数据（`{zh, en, descZh, descEn}`，用于跨语言翻译与 popover 介绍）

## 技术栈

- **前端**：原生 ES Modules + Hash 路由，无构建工具
- **后台**：Python `http.server` + PySide6 + QWebEngineView（本地）
- **数据**：单文件 JSON（`projects.json`）

## License

MIT
