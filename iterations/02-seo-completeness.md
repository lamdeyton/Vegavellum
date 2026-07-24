# R2：SEO 完整性

> 触发：R1 审计发现子目标 4（SEO/元数据）完全缺失。无 sitemap、无 robots.txt、无 OG tags、无 favicon。

## 审计发现

### G1：SEO 元数据完全缺失

**症状**：MVP 的 `Base.astro` 只有 `<title>` 和 `<meta name="description">`，缺少：
- sitemap.xml（搜索引擎发现页面）
- robots.txt（爬虫指引）
- OG tags（社交媒体分享预览）
- Twitter Card（Twitter 分享预览）
- canonical URL（避免重复内容惩罚）
- favicon（浏览器标签页图标）

**后果**：
- 搜索引擎无法高效发现页面
- 社交媒体分享无预览（只有裸链接）
- 浏览器标签页无图标，专业感不足

## 实施的变更

### 1. @astrojs/sitemap 集成

在 `astro.config.mjs` 中添加 `sitemap()` 集成，自动生成 `sitemap-index.xml` + `sitemap-0.xml`。

### 2. Base.astro 扩展 SEO 元数据

- 新增 `path` prop，用于生成 canonical URL 和 og:url
- 添加 `<link rel="canonical">`
- 添加 `<link rel="icon" type="image/svg+xml">`
- 添加 `<link rel="sitemap">`
- 添加 OG tags：og:type / og:title / og:description / og:url / og:site_name / og:locale
- 添加 Twitter Card：twitter:card / twitter:title / twitter:description

### 3. 页面传入 path prop

- `src/pages/category/[id].astro`：传 `path={`category/${category.id}`}`
- `src/pages/project/[slug].astro`：传 `path={`project/${project.slug}`}`
- `src/pages/index.astro`：默认空字符串，自动生成首页 URL

### 4. SVG favicon

创建 `public/favicon.svg`：Vegavellum 星卷主题
- 深紫夜空背景（#14132b，与站点 header 一致）
- 左上四角星（织女星）
- 下方 V 字形卷轴（Vellum，紫色渐变 + 顶部高光）

### 5. robots.txt

创建 `public/robots.txt`：允许所有爬虫 + 指向 sitemap。

## 过程中的真实 bug

### E1：@astrojs/sitemap@3.7.3 与 Astro 4 不兼容

**症状**：`npm install @astrojs/sitemap` 默认装了 3.7.3，构建时报 `Cannot read properties of undefined (reading 'reduce')`。

**根因**：3.7.3 依赖 `astro:routes:resolved` 钩子（[src/index.js:35](file:///Users/lamdeyton/Library/Application%20Support/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a6300d9dbe95cc4e806642c/node_modules/@astrojs/sitemap/dist/index.js#L35)），这是 Astro 5+ 新增 API。Astro 4.16.19 不触发该钩子，导致 `_routes` 永远 undefined。

**修复**：锁定 `@astrojs/sitemap@3.2.1`（兼容 Astro 4）。

### E2：尝试升级 Astro 7 引入破坏性变更

**尝试**：`npm install astro@latest` 升级到 7.1.3，希望解决 sitemap 兼容性。

**症状**：构建报 `ENOENT: no such file or directory, open '.../dist/data/categories.yaml'`。

**根因**：Astro 7 改变了构建流程，`import.meta.url` 在构建时指向 `dist/.prerender/chunks/` 而非源码位置，导致 `src/lib/data.ts` 的 `__dirname` 路径计算失效。

**决策**：降回 Astro 4.16.19（稳定），避免引入 Astro 7 的破坏性变更。Astro 7 迁移是独立大任务，不在 MVP 迭代范围内。

**最终方案**：`astro@4.16.19` + `@astrojs/sitemap@3.2.1`，全部 `--save-exact` 锁定。

## MVP 回归验证

```
npm run build
  ✓ 15 page(s) built in 495ms
  ✓ sitemap-index.xml created at dist
  ✓ dist/sitemap-0.xml: 15 URLs（1 首页 + 9 分类 + 5 项目）
  ✓ dist/robots.txt: 指向 sitemap
  ✓ dist/favicon.svg: 星卷主题
  ✓ OG tags: og:type/title/description/url/site_name/locale 全部渲染
  ✓ Twitter Card: summary + title + description
  ✓ canonical URL: 每页独立
```

## 子目标进展

| 子目标 | R1 后深度 | R2 后深度 |
|--------|----------|----------|
| 1. 数据完整性 | 深 | 深 |
| 2. 路由正确性 | 深 | 深 |
| 3. 可访问性 | 未涉及 | 未涉及 |
| 4. SEO/元数据 | 未涉及 | **深**（sitemap + robots + OG + Twitter + canonical + favicon） |
| 5. 部署链路 | 深 | 深 |
| 6. 可扩展性 | 未涉及 | 未涉及 |

## 下轮计划

R3：用户体验完善（404 + 首页统计 + 空分类 CTA + CONTRIBUTING + LICENSE）—— 子目标 3 + 6
R4：最终审计 + 三类 audit + 6 子目标全验证
