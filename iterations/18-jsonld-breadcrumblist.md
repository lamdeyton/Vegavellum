# R18 — JSON-LD BreadcrumbList 结构化数据

> 超长程任务模式第十八轮。R15 面包屑的 SEO 增强：从视觉导航升级为搜索引擎可理解的结构化数据。

## 触发原因

R15 实现了视觉面包屑导航，但没有 JSON-LD 结构化数据。Google 搜索结果可能显示面包屑（而非完整 URL），提升点击率和搜索体验。这是 R15 的自然延伸（Connection 型迭代：视觉面包屑 + JSON-LD 结构化数据 = 完整面包屑方案）。

## 审计发现

### N1（Connection · SEO）：面包屑导航缺少 JSON-LD 结构化数据

**症状**：
- R15 实现了视觉面包屑（`<nav class="breadcrumb">`），有 `aria-label`
- 但无 `application/ld+json` 结构化数据
- 搜索引擎只能通过 DOM 解析推断面包屑，不保证正确理解层级

**影响**：
- Google 搜索结果可能显示完整 URL 而非面包屑（如 `lamdeyton.github.io/Vegavellum/project/nextjs/` vs `首页 > 前端框架 > Next.js`）
- 错失 rich result 机会（BreadcrumbList 是 Google 支持的结构化数据类型）

**修复**：

1. Base.astro 添加 `jsonLd` prop 和注入逻辑：
```astro
interface Props {
  // ... 原有 props
  jsonLd?: object | object[];
}

<!-- head 末尾注入 -->
{jsonLd && (
  <script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />
)}
```

2. project/[slug].astro 构造 BreadcrumbList JSON-LD：
```javascript
const breadcrumbLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: '首页', item: `${siteUrl}${base}/` },
    ...(category ? [{ '@type': 'ListItem', position: 2, name: category.name, item: `${siteUrl}${base}/category/${category.id}/` }] : []),
    { '@type': 'ListItem', position: category ? 3 : 2, name: project.name, item: `${siteUrl}${base}/project/${project.slug}/` },
  ],
};
```

3. 传入 Base：`<Base ... jsonLd={breadcrumbLd}>`

**设计取舍**：
- 只在 project 详情页注入 BreadcrumbList（分类页层级只有 首页 > 分类，JSON-LD 价值低）
- URL 用绝对 URL（schema.org 要求）
- 当前页（project）也包含在 itemListElement 中（Google 推荐包含当前页）
- position 动态计算（无 category 时 position 2，有 category 时 position 3）

## MVP 回归验证

```bash
ASTRO_TELEMETRY_DISABLED=1 npm run build
# ✓ 16 page(s) built in 445ms

grep -c "application/ld+json" dist/project/nextjs/index.html
# 1（JSON-LD script 已注入）

grep -o "BreadcrumbList" dist/project/nextjs/index.html | head -1
# BreadcrumbList（结构化数据类型正确）
```

构建无回归，JSON-LD 正确注入到 5 个 project 详情页。

## 子目标深度演进

R18 后，6 子目标状态：
1. 数据完整性 — 深+
2. 路由正确性 — 深+
3. 可访问性 — 深
4. **SEO/元数据 — 深+**（JSON-LD 结构化数据补全，从"完整"到"可被搜索引擎结构化理解"）
5. 部署链路 — 深+
6. 可扩展性 — 深

## Connection 型迭代模式

R18 是典型的 Connection 型迭代（long-range-task-execution skill 文档定义）：
- R15（视觉面包屑）和 R18（JSON-LD）各自独立完成
- 但两者接口（面包屑的语义信息）需要打通
- Connection 迭代不是可选的 —— 是能力复合的地方

| 轮次 | 类型 | 产物 |
|------|------|------|
| R15 | 视觉面包屑 | `<nav class="breadcrumb">` + aria-label |
| R18 | 结构化面包屑 | JSON-LD BreadcrumbList |

## 下一轮候选（R19 审计输入）

R18 完成后剩余候选（边际显著递减）：
- **astro check 类型检查**：未纳入 CI（需新增 devDeps，MVP 规模下手动审查 suffice）
- **PNG og:image**：Twitter 不支持 SVG（需图片生成工具）
- **sitemap lastmod**：SEO 微优化（需 build 时动态生成）
- **JSON-LD for Organization/WebSite**：首页可加组织结构化数据（价值低）
