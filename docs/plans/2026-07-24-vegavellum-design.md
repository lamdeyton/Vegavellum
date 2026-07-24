# Vegavellum 设计方案

> 织星为卷，索引开源。

## 项目命名

- **名称**：Vegavellum
- **拆解**：Vega + Vellum
  - **Vega** — 织女星
    - 东方意象：七夕织女编织云锦，对应「编目 / 编织」
    - 西方认知：天琴座 α，夏季最亮导航星，对应「指引 / 导航」
  - **Vellum** — 精制羊皮纸，西方珍贵书写载体代名词
  - **合义** — 将散落于 GitHub 星河中的优质开源项目，精心编织誊抄于一卷珍贵典籍
- **中文昵称**：织星卷 / 星卷
- **重名核查**（2026-07-24）：
  - GitHub 仓库 `vegavellum`：无重名（total_count: 0）
  - npm 包 `vegavellum`：无命中
  - 域名 `vegavellum.com/.io/.org`：无在用记录，大概率可注册
- **Slogan 候选**：
  - `Weaving the GitHub galaxy onto one scroll.`
  - `织星为卷，索引开源。`

## 项目定位

- **形态**：精选目录式（curated directory）
- **受众**：全球开发者
- **内容产出模式**：A + B + C 融合
  - **A 层 · 人工策展**（维护者）：最终拍板 → 分类归属 → 写入正式目录 → 发布
  - **B 层 · 社区共建**（贡献者）：PR 提名 + 讨论 → 维护者初审 → 进入待收录队列
  - **C 层 · 自动发现**（机器人）：GitHub Action 定时抓取 → 指标阈值筛选 → 进入候选池

## 整体架构

```
┌─────────────────────────────────────────────────────┐
│  数据层（Git 仓库 data/projects/*.yaml）             │
│  单项目一文件，结构化存储，Git 可追溯                 │
└──────────────────┬──────────────────────────────────┘
                   ↓ GitHub Actions 构建
┌─────────────────────────────────────────────────────┐
│  构建层（CI）                                         │
│  ├─ C 层机器人：定时抓取 → 阈值筛选 → 生成候选 YAML   │
│  ├─ B 层审核：PR 提名 → 维护者 review → 合并          │
│  └─ A 层策展：维护者分类归属 → 发布                   │
└──────────────────┬──────────────────────────────────┘
                   ↓ 部署到
┌─────────────────────────────────────────────────────┐
│  展示层（Astro 静态站点 → GitHub Pages）             │
│  分类浏览 + 搜索 + 筛选 + 项目详情页                  │
└─────────────────────────────────────────────────────┘
```

### 关键设计取舍

- **数据存储**：Git 仓库 + GitHub Pages 静态站点
  - 理由：Git 可追溯、社区 PR 友好、零服务器成本、与 awesome-list 生态兼容
- **站点框架**：Astro
  - 理由：内容驱动、默认零 JS、构建快、原生支持 YAML 数据集合、SEO 极佳、贡献者友好
- **分类体系**：扁平分类（起步阶段）
  - 理由：用户熟悉、贡献门槛低；随项目增长动态扩展，不预设死
- **C 层抓取策略**：指标阈值筛选
  - 机器人定期按 stars 阈值 + 活跃度（近半年有提交）抓取 GitHub Trending + 搜索结果，自动生成候选 YAML 进入待审队列

### 分支策略

- `main` — 正式发布分支，受保护，只接受审核通过的 PR
- `mvp-demo` — MVP 阶段，先跑通最小闭环

## MVP 范围

### 目标

跑通最小闭环——从数据到展示可访问、可验证。不做 C 层机器人、不做 B 层社区流程，只验证 A 层 + 展示层。

### MVP 做 / 不做

| 做 | 不做 |
|---|---|
| ✅ Astro 站点骨架 + GitHub Pages 部署 | ❌ C 层自动抓取机器人 |
| ✅ YAML 数据结构 + 5~10 个种子项目 | ❌ B 层 PR 提名流程模板 |
| ✅ 扁平分类页 + 项目详情页 | ❌ 搜索功能 |
| ✅ 项目列表页（按分类筛选） | ❌ 评分排序 |
| ✅ 基础样式 + Vegavellum 品牌 | ❌ i18n 多语言 |

### MVP 目录结构

```
Vegavellum/
├── .github/workflows/
│   └── deploy.yml              # Astro 构建并部署到 Pages
├── data/
│   ├── categories.yaml         # 分类定义
│   └── projects/               # 项目数据
│       ├── nextjs.yaml
│       ├── astro.yaml
│       └── ...
├── src/
│   ├── pages/
│   │   ├── index.astro         # 首页：分类入口
│   │   ├── category/[id].astro # 分类详情页
│   │   └── project/[slug].astro# 项目详情页
│   ├── components/
│   │   ├── ProjectCard.astro
│   │   └── CategoryList.astro
│   └── layouts/
│       └── Base.astro
├── astro.config.mjs
├── package.json
└── README.md
```

### MVP 验收标准

1. `npm run dev` 本地可访问，首页显示分类列表
2. 点击分类可查看该分类下项目列表
3. 点击项目可查看项目详情（名称 / repo / 描述 / 标签 / 许可证）
4. `git push` 到 `mvp-demo` 分支后，GitHub Actions 自动构建并部署到 GitHub Pages
5. 种子数据包含至少 5 个真实项目，覆盖至少 3 个分类

### MVP 后迭代路线（仅规划，不当前做）

```
MVP（当前） → 搜索功能 → C 层机器人 → B 层 PR 模板 → 评分排序 → i18n
```

## 数据结构

### 分类定义 `data/categories.yaml`

```yaml
- id: frontend-framework
  name: 前端框架
  name_en: Frontend Framework
  icon: 🎨
  description: 构建 Web 前端应用的核心框架

- id: backend-framework
  name: 后端框架
  name_en: Backend Framework
  icon: ⚙️
  description: 服务端应用开发框架

- id: dev-tools
  name: 开发工具
  name_en: Dev Tools
  icon: 🛠️
  description: 提升开发效率的工具集

- id: ai-ml
  name: AI / 机器学习
  name_en: AI / ML
  icon: 🤖
  description: 人工智能与机器学习相关项目

- id: database
  name: 数据库
  name_en: Database
  icon: 🗄️
  description: 数据库与存储方案

- id: devops
  name: 运维 / 部署
  name_en: DevOps
  icon: 🚀
  description: 运维、部署与基础设施

- id: security
  name: 安全
  name_en: Security
  icon: 🔒
  description: 安全相关工具与框架

- id: cli
  name: 命令行工具
  name_en: CLI
  icon: ⌨️
  description: 命令行工具与终端应用

- id: libraries
  name: 通用库
  name_en: Libraries
  icon: 📦
  description: 通用编程库与工具包
```

### 项目数据 `data/projects/<slug>.yaml`

```yaml
# 必填字段
name: Next.js              # 项目名称
slug: nextjs               # URL 友好的唯一标识
repo: vercel/next.js       # owner/repo 格式
description: The React Framework for the Web
category: frontend-framework  # 对应 categories.yaml 中的 id

# 可选字段
url: https://nextjs.org       # 官网（无则用 GitHub repo）
license: mit                  # SPDX 标识符
tags: [react, ssr, ssg, fullstack, react-server-components]
language: TypeScript         # 主语言

# 元数据（自动维护，贡献者无需填写）
addedAt: 2026-07-24
status: published           # published | pending | rejected
sources: [auto-discovered] # auto-discovered | community-nominated | curator-curated
```

### 种子项目（5 个，覆盖 3 分类）

#### `data/projects/nextjs.yaml`

```yaml
name: Next.js
slug: nextjs
repo: vercel/next.js
description: The React Framework for the Web
category: frontend-framework
url: https://nextjs.org
license: mit
tags: [react, ssr, ssg, fullstack]
language: TypeScript
addedAt: 2026-07-24
status: published
sources: [curator-curated]
```

#### `data/projects/astro.yaml`

```yaml
name: Astro
slug: astro
repo: withastro/astro
description: The web framework for content-driven websites
category: frontend-framework
url: https://astro.build
license: mit
tags: [static-site-generator, mdx, islands]
language: TypeScript
addedAt: 2026-07-24
status: published
sources: [curator-curated]
```

#### `data/projects/deno.yaml`

```yaml
name: Deno
slug: deno
repo: denoland/deno
description: A modern runtime for JavaScript and TypeScript
category: dev-tools
url: https://deno.land
license: mit
tags: [runtime, typescript, javascript]
language: Rust
addedAt: 2026-07-24
status: published
sources: [curator-curated]
```

#### `data/projects/ripgrep.yaml`

```yaml
name: ripgrep
slug: ripgrep
repo: BurntSushi/ripgrep
description: recursively search directories for a regex pattern
category: cli
url: https://github.com/BurntSushi/ripgrep
license: unlicense
tags: [search, grep, cli, rust]
language: Rust
addedAt: 2026-07-24
status: published
sources: [curator-curated]
```

#### `data/projects/langchain.yaml`

```yaml
name: LangChain
slug: langchain
repo: langchain-ai/langchain
description: Build context-aware reasoning applications
category: ai-ml
url: https://langchain.com
license: mit
tags: [llm, ai, agents, rag]
language: Python
addedAt: 2026-07-24
status: published
sources: [curator-curated]
```

## 远程仓库

- `git@github.com:lamdeyton/Vegavellum.git`
- HTTPS: `https://github.com/lamdeyton/Vegavellum`
