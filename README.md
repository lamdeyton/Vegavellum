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

# 数据校验（检查 YAML 契约一致性）
npm run validate

# 构建生产版本（输出到 dist/）
npm run build

# 本地预览构建产物
npm run preview
```

> 注：如本地构建遇到 Astro 遥测权限错误，设置环境变量 `ASTRO_TELEMETRY_DISABLED=1` 后重试，或执行 `astro telemetry disable` 全局禁用。

## 项目结构

```
Vegavellum/
├── .github/workflows/
│   └── deploy.yml              # CI：数据校验 + 构建 + 部署到 GitHub Pages
├── data/
│   ├── categories.yaml         # 分类定义（9 个扁平分类）
│   └── projects/               # 项目数据（单项目一文件）
│       ├── nextjs.yaml
│       ├── astro.yaml
│       ├── deno.yaml
│       ├── ripgrep.yaml
│       └── langchain.yaml
├── public/
│   ├── favicon.svg             # Vegavellum 星卷主题图标
│   └── robots.txt              # 爬虫指引 + sitemap 链接
├── scripts/
│   └── validate-data.mjs       # 数据契约校验脚本
├── src/
│   ├── lib/
│   │   └── data.ts             # 数据读取与解析工具函数
│   ├── layouts/
│   │   └── Base.astro          # 基础 HTML 布局（含 SEO 元数据）
│   ├── components/
│   │   ├── ProjectCard.astro   # 项目卡片
│   │   └── CategoryList.astro  # 分类列表
│   └── pages/
│       ├── index.astro         # 首页：slogan + 统计 + 分类入口
│       ├── 404.astro           # 自定义 404 页面
│       ├── category/[id].astro # 分类详情页
│       └── project/[slug].astro# 项目详情页
├── astro.config.mjs            # Astro 配置（含 sitemap 集成）
├── package.json
├── CONTRIBUTING.md             # 贡献指南
├── LICENSE                     # MIT
└── README.md
```

## 功能

- **精选目录**：扁平分类，9 个类别覆盖主流领域
- **静态站点**：Astro 4 构建，零 JS 默认，SEO 友好
- **数据校验**：`npm run validate` 检查 YAML 契约（category 引用、slug 文件名一致性、必填字段、枚举值）
- **SEO 完整**：sitemap.xml、robots.txt、OG tags、Twitter Card、canonical URL、SVG favicon
- **CI/CD**：GitHub Actions 自动校验 + 构建 + 部署到 GitHub Pages
- **贡献友好**：CONTRIBUTING.md 详述数据格式与提交流程

## 贡献

欢迎通过 PR 提名优质开源项目。请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解数据格式、分类对照、本地验证步骤和收录标准。

## 技术栈

- [Astro 4](https://astro.build/) — 静态站点生成器
- [@astrojs/sitemap](https://github.com/withastro/astro/tree/main/packages/integrations/sitemap) — sitemap 自动生成
- YAML — 项目数据存储
- GitHub Actions — CI/CD
- GitHub Pages — 部署

## 远程仓库

- SSH：`git@github.com:lamdeyton/Vegavellum.git`
- HTTPS：`https://github.com/lamdeyton/Vegavellum`

## 许可证

[MIT](./LICENSE)
