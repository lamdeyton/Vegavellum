# Vegavellum

> 织星为卷，索引开源。
>
> _Weaving the GitHub galaxy onto one scroll._

Vegavellum 是一个精选目录式（curated directory）的 GitHub 开源项目索引，使用 Astro 静态站点 + GitHub Pages 构建，零服务器成本，Git 可追溯，社区 PR 友好。

## 命名释义

- **名称**：Vegavellum
- **拆解**：Vega + Vellum
  - **Vega** — 织女星
    - 东方意象：七夕织女编织云锦，对应「编目 / 编织」
    - 西方认知：天琴座 α，夏季最亮导航星，对应「指引 / 导航」
  - **Vellum** — 精制羊皮纸，西方珍贵书写载体代名词
  - **合义** — 将散落于 GitHub 星河中的优质开源项目，精心编织誊抄于一卷珍贵典籍
- **中文昵称**：织星卷 / 星卷

## 快速开始

```bash
# 安装依赖
npm install

# 本地开发
npm run dev

# 构建生产版本（输出到 dist/）
npm run build

# 本地预览构建产物
npm run preview
```

## 项目结构

```
Vegavellum/
├── .github/workflows/
│   └── deploy.yml              # Astro 构建并部署到 GitHub Pages
├── data/
│   ├── categories.yaml         # 分类定义
│   └── projects/               # 项目数据（单项目一文件）
│       ├── nextjs.yaml
│       ├── astro.yaml
│       ├── deno.yaml
│       ├── ripgrep.yaml
│       └── langchain.yaml
├── src/
│   ├── lib/
│   │   └── data.ts             # 数据读取与解析工具函数
│   ├── layouts/
│   │   └── Base.astro          # 基础 HTML 布局
│   ├── components/
│   │   ├── ProjectCard.astro   # 项目卡片
│   │   └── CategoryList.astro  # 分类列表
│   └── pages/
│       ├── index.astro         # 首页：分类入口
│       ├── category/[id].astro # 分类详情页
│       └── project/[slug].astro# 项目详情页
├── astro.config.mjs
├── package.json
└── README.md
```

## 远程仓库

- SSH：`git@github.com:lamdeyton/Vegavellum.git`
- HTTPS：`https://github.com/lamdeyton/Vegavellum`
