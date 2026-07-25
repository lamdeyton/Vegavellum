# R23 · 首页添加 WebSite JSON-LD

> 轮次类型：Connection（R18/R20 JSON-LD 未传播到首页）
> 触发：R22 后三类审计发现 — R18/R20 为 project 和 category 页添加了 BreadcrumbList JSON-LD，但首页（站点根）没有任何 JSON-LD 结构化数据。

## 审计发现

### N1（Connection · JSON-LD 未覆盖首页）：首页缺少 WebSite JSON-LD

**症状**：

- R18 为 project 详情页加 BreadcrumbList JSON-LD
- R20 为 category 详情页加 BreadcrumbList JSON-LD
- 但 `src/pages/index.astro` 没有传 `jsonLd` prop
- 构建产物 `dist/index.html` 中无任何 `application/ld+json` 脚本
- 搜索引擎无法从结构化数据层理解站点身份（名称、URL、描述）

**根本原因**：R18/R20 关注的是层级关系（BreadcrumbList），未考虑首页作为站点根需要的 WebSite schema。这是 Connection gap：JSON-LD 能力没有完全传播到所有页面类型。

**外部规范依据**：

Google 官方文档（https://developers.google.com/search/docs/appearance/structured-data/site-name）明确推荐首页使用 WebSite schema：
- 帮助 Google 在搜索结果中正确显示站点名称（而非 URL）
- 提升品牌识别度
- 是行业最佳实践

**证伪测试**：
- 验证方式：`dist/index.html` 中包含 `"@type":"WebSite"` 的 JSON-LD
- 外部压力：Google 官方推荐 + 同类目录站（如 awesome-go.com）均采用

## 修复方案

### `src/pages/index.astro`

构造 WebSite JSON-LD（不包含 SearchAction，因为站点无搜索功能，避免声明无法履行的功能）：

```javascript
const siteUrl = Astro.site?.toString().replace(/\/$/, '') ?? '';
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

const websiteLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Vegavellum',
  alternateName: '织星卷',
  url: `${siteUrl}${base}/`,
  description: '精选目录式 GitHub 开源项目索引',
  inLanguage: 'zh-CN',
};
```

传入 Base 组件：

```astro
<Base title="..." jsonLd={websiteLd}>
```

**设计取舍**：

- `alternateName: '织星卷'`：中文昵称，让 Google 在中文搜索场景下也能识别
- 不加 `potentialAction: SearchAction`：站点当前无搜索功能，声明了无法履行会被搜索引擎降权
- `inLanguage: 'zh-CN'`：明确站点主语言

## 实施变更

### 修改 `src/pages/index.astro` frontmatter：

```javascript
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const siteUrl = Astro.site?.toString().replace(/\/$/, '') ?? '';

const websiteLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Vegavellum',
  alternateName: '织星卷',
  url: `${siteUrl}${base}/`,
  description: '精选目录式 GitHub 开源项目索引',
  inLanguage: 'zh-CN',
};
```

### 修改 Base 调用：

```astro
<Base title="Vegavellum · 织星为卷，索引开源" jsonLd={websiteLd}>
```

## 验证

- `npm run validate` 通过
- `ASTRO_TELEMETRY_DISABLED=1 npm run build` 通过
- 构建产物 `dist/index.html` 包含 `"@type":"WebSite"` JSON-LD
- JSON-LD 字段完整：name / alternateName / url / description / inLanguage

## 6 子目标深度演进

| 子目标 | R22 | R23 |
|--------|-----|-----|
| 1. 数据完整性 | 深+ | 深+ |
| 2. 路由正确性 | 深+ | 深+ |
| 3. 可访问性 | 深 | 深 |
| 4. SEO/元数据 | 深+ | 深+（首页 WebSite JSON-LD 补齐 JSON-LD 三层覆盖：首页 WebSite + 详情页 BreadcrumbList） |
| 5. 部署链路 | 深+ | 深+ |
| 6. 可扩展性 | 深+ | 深+ |

## 教训

**JSON-LD 覆盖审计清单**：当为某类页面添加 JSON-LD 时，必须检查所有页面类型：

| 页面类型 | 适合的 JSON-LD 类型 | 状态 |
|---------|-------------------|------|
| 首页 | WebSite（声明站点身份） | R23 修复 |
| 列表/分类页 | BreadcrumbList（声明层级） | R20 修复 |
| 详情页 | BreadcrumbList（声明层级） + 可选具体类型（如 SoftwareApplication） | R18 修复（仅 BreadcrumbList） |

R18/R20 时只考虑了"层级关系"的 BreadcrumbList，未考虑"站点身份"的 WebSite。这是 Connection 审计不全面的体现。

**未来 SEO 改动的页面覆盖检查**：每项 SEO 改动必须列出"应覆盖的页面类型清单"，逐一确认。
