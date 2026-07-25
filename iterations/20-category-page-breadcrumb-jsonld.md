# R20 · category 页补齐面包屑 + JSON-LD BreadcrumbList

> 轮次类型：Connection（R15 + R18 未传播到 category 页）
> 触发：R19 后三类审计发现 — R15（面包屑）和 R18（JSON-LD）只在 project/[slug].astro 落地，category/[id].astro 仍是"← 返回首页"且无 JSON-LD。

## 审计发现

### N1（Connection · R15 未传播）：category 页缺少面包屑导航

**症状**：

- R15 修复了 project 详情页的"返回首页"，改为面包屑（首页 > 分类 > 项目）
- 但 `src/pages/category/[id].astro` 第 24 行仍是：
  ```astro
  <a class="back" href={`${base}/`}>← 返回首页</a>
  ```
- 用户从首页进入分类页 → 点项目进入详情页 → 点面包屑"分类"回到分类页 → 此时分类页又显示"← 返回首页"
- 导航模式在 project ↔ category 之间断层，违反 R15 的设计意图

**根本原因**：R15 只修复了 project 详情页的导航，未传播到同样有"返回首页"的 category 详情页。

### N2（Connection · R18 未传播）：category 页缺少 JSON-LD BreadcrumbList

**症状**：

- R18 为 project 详情页添加了 BreadcrumbList JSON-LD（首页 > 分类 > 项目）
- 但 `category/[id].astro` 没有 JSON-LD，搜索引擎无法理解 category 页的层级（首页 > 分类）
- 与 R18 的设计意图不一致

**根本原因**：R18 只在 project 详情页落地 JSON-LD，未传播到同样是层级中间页的 category 页。

## 修复方案

### `src/pages/category/[id].astro`

1. 移除"← 返回首页"，替换为与 project 详情页一致的面包屑导航（首页 > 当前分类）
2. 构造 BreadcrumbList JSON-LD，传入 Base 组件的 `jsonLd` prop
3. 复用 project/[slug].astro 的面包屑样式（保持视觉一致性）

## 实施变更

### 1. frontmatter 中构造 JSON-LD：

```javascript
const siteUrl = Astro.site?.toString().replace(/\/$/, '') ?? '';

const breadcrumbLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: '首页',
      item: `${siteUrl}${base}/`,
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: category.name,
      item: `${siteUrl}${base}/category/${category.id}/`,
    },
  ],
};
```

### 2. 模板替换：

```astro
<nav class="breadcrumb" aria-label="面包屑导航">
  <a href={`${base}/`}>首页</a>
  <span class="sep" aria-hidden="true">/</span>
  <span class="current" aria-current="page">{category.icon} {category.name}</span>
</nav>
```

### 3. Base 组件传入 jsonLd：

```astro
<Base title={...} description={...} path={...} jsonLd={breadcrumbLd}>
```

### 4. 样式复用 project/[slug].astro 的 `.breadcrumb` 样式

## 验证

- `npm run validate` 通过
- `ASTRO_TELEMETRY_DISABLED=1 npm run build` 通过
- 构建产物 `dist/category/frontend-framework/index.html` 包含：
  - `<nav class="breadcrumb">` 面包屑
  - `<script type="application/ld+json">` BreadcrumbList
- 不再有 `← 返回首页` 文本

## 6 子目标深度演进

| 子目标 | R19 | R20 |
|--------|-----|-----|
| 1. 数据完整性 | 深+ | 深+ |
| 2. 路由正确性 | 深+ | 深+ |
| 3. 可访问性 | 深 | 深（breadcrumb aria-current 强化当前页标识） |
| 4. SEO/元数据 | 深+ | 深+（JSON-LD 覆盖到 category 层） |
| 5. 部署链路 | 深+ | 深+ |
| 6. 可扩展性 | 深+ | 深+ |

## 教训

**Connection 型 gap 是最隐蔽的**：R15 和 R18 各自独立完成时都验证通过，但只覆盖了 project 详情页。同类型导航/SEO 改动应同时审视所有"层级中间页"。

**Connection 审计清单**：当在某页面 P 实现一项层级相关功能 F 时，必须检查：
- 所有比 P 层级更深的页面（如 project 详情页之于 category 详情页）是否已有 F
- 所有比 P 层级更浅的同类页面（如 category 详情页之于 project 详情页）是否也应有 F
- 父子层级一致的页面（多个 category 详情页、多个 project 详情页）是否同步覆盖

R20 补齐后，category 页和 project 页的导航/SEO 元数据层级实现完全一致。
