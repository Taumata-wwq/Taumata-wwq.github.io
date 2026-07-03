# Taumata

插画师个人网站 · 作品集 / 笔记 / 关于页

## 功能

- **作品展示**：图片画廊、详情页、Lightbox 查看器（拖拽/缩放/旋转）
- **笔记**：Markdown 渲染、标签分类
- **标签系统**：点击弹出相关作品/笔记、跨语言匹配
- **后台管理**：PySide6 桌面应用，可视化编辑作品/笔记/标签/关于页
- **图片优化**：自动生成 600px 缩略图，Service Worker 缓存加速
- **国际化**：中英文双语，一键切换
- **主题**：明暗模式 + 自定义强调色
- **GitHub Pages 部署**：一键推送

## 快速开始

### 环境要求

- Python 3.8+
- PySide6（桌面管理台）
- Pillow（缩略图生成）

### 安装依赖

```bash
pip install PySide6 Pillow
```

### 启动

**Windows**：双击 `start.bat`（自动隐藏命令行窗口）

**其他系统 / 命令行**：

```bash
python app.py       # 启动桌面管理台
# 或
python serve.py     # 仅启动服务器，浏览器访问 http://127.0.0.1:8000/
```

启动后：
- 桌面应用内嵌后台管理页（`admin.html`）
- 本地服务器提供 API 和静态资源（`127.0.0.1:8000`）

## 项目结构

```
.
├── index.html          # 主站入口
├── admin.html          # 后台管理页
├── app.py              # PySide6 桌面应用
├── serve.py            # 本地开发服务器（含图片上传/删除 API）
├── sw.js               # Service Worker（图片缓存）
├── start.bat           # Windows 启动器
├── optimize_images.py  # 图片批量压缩工具
├── .nojekyll           # 禁用 GitHub Pages 的 Jekyll
└── assets/
    ├── css/            # 样式表
    ├── js/             # 脚本（router / admin / theme / i18n）
    ├── data/
    │   └── projects.json   # 所有数据（站点/作品/笔记/标签/关于）
    └── images/         # 图片资源
        └── thumb/      # 自动生成的缩略图
```

## 部署

推送到 GitHub 的 `main` 分支即可自动部署到 GitHub Pages。

```bash
git add -A
git commit -m "更新内容"
git push
```

## 技术栈

- **前端**：原生 ES Modules + Hash 路由，无构建工具
- **后端**：Python `http.server`，零依赖
- **桌面**：PySide6 + QWebEngineView
- **数据**：单文件 JSON（`projects.json`）

## License

MIT
