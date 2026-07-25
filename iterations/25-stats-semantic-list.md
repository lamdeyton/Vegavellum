# R25 · 首页 stats 区域语义化（WCAG 1.3.1）

> 轮次类型：Horizontal（HTML 结构 ↔ 语义对齐）
> 触发：R24 后三类审计发现 — 首页 stats 区域用 `<div class="stats">` + `<div class="stat">` 表达 3 项并列统计，未用 ul/li 表达列表关系，违反 WCAG 1.3.1 Info and Relationships (Level A)。

## 审计发现

### N1（Horizontal · HTML 语义）：stats 区域缺少列表语义

**症状**：

`src/pages/index.astro` 当前 stats 结构：

```astro
<div class="stats">
  <div class="stat">
    <span class="num">{stats.projects}</span>
    <span class="label">已收录项目</span>
  </div>
  <div class="stat">
    <span class="num">{stats.categoriesWithProjects}</span>
    <span class="label">已覆盖分类</span>
  </div>
  <div class="stat">
    <span class="num">{stats.categories}</span>
    <span class="label">总分类数</span>
  </div>
</div>
```

- 3 个并列的"数字+标签"组合本质上是统计列表
- 用 `<div>` 表达，屏幕阅读器不识别为列表
- 屏幕阅读器朗读："5 已收录项目 3 已覆盖分类 9 总分类数"
  - 用户不知道有几项统计
  - 无法用列表快捷键（JAWS/NVDA 的 `L` 键）跳转
- 违反 WCAG 1.3.1 Info and Relationships (A)："Information, structure, and relationships conveyed through presentation can be programmatically determined or are available in text"

**根本原因**：

R3 实现 stats 时只考虑视觉布局（flex 横向排列），未考虑语义化。3 个 div.stat 在视觉上是横向并列的统计项，但 DOM 结构未表达"列表"关系。

**外部规范依据**：

WCAG 1.3.1 Info and Relationships (Level A)：
- 通过呈现传达的信息、结构和关系应能通过程序化方式确定
- "3 项并列统计"是结构关系，应用 `<ul>` + `<li>` 表达

**证伪测试**：

- 验证方式：`dist/index.html` 中 stats 用 `<ul>` + `<li>`
- 外部压力：WCAG 1.3.1 (A) 是基础 a11y 条款，与 R7/R13/R24 同级

## 修复方案

### `src/pages/index.astro`

```astro
<ul class="stats">
  <li class="stat">
    <span class="num">{stats.projects}</span>
    <span class="label">已收录项目</span>
  </li>
  <li class="stat">
    <span class="num">{stats.categoriesWithProjects}</span>
    <span class="label">已覆盖分类</span>
  </li>
  <li class="stat">
    <span class="num">{stats.categories}</span>
    <span class="label">总分类数</span>
  </li>
</ul>
```

### CSS 调整

`.stats` 已有 `list-style: none; padding: 0;` 隐式需求（因 div 默认无样式），改 ul 后需显式重置：

```css
.stats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  /* ... 原有样式 */
}
```

## 验证

- `npm run validate` 通过
- `ASTRO_TELEMETRY_DISABLED=1 npm run build` 通过
- 构建产物 `dist/index.html` 中 stats 用 `<ul class="stats">` + `<li class="stat">`
- 视觉无变化（CSS 重置后渲染一致）

## 6 子目标深度演进

| 子目标 | R24 | R25 |
|--------|-----|-----|
| 1. 数据完整性 | 深+ | 深+ |
| 2. 路由正确性 | 深+ | 深+ |
| 3. 可访问性 | 深 | 深（WCAG 1.3.1 Info and Relationships A 新增，a11y 条款覆盖 +1） |
| 4. SEO/元数据 | 深+ | 深+ |
| 5. 部署链路 | 深+ | 深+ |
| 6. 可扩展性 | 深+ | 深+ |

## 教训

**HTML 语义化审计不止于"用了 nav/main/header"，还要看每组并列元素的列表关系**：

- R20 用 `<nav>` + `aria-label` 表达面包屑导航关系 ✓
- R25 用 `<ul>` + `<li>` 表达统计列表关系 ✓（本轮修复）

未来 HTML 语义化审计清单新增：
- 所有视觉上"并列的同类元素"是否用 ul/li 或 ol/li？
  - 首页 stats ✓（R25）
  - 首页分类列表 ✓（已 ul/li）
  - 卡片列表（category/[id].astro 的 grid）— 当前用 `<section class="grid">` 直接放 ProjectCard，没有 ul 包裹。但 ProjectCard 是 `<article>`，多个 article 可以不需要 ul 包裹（article 本身是独立内容单元）。不过严格按 WCAG 1.3.1，"3 个并列的 article 卡片"也可以用 ul 包裹表达列表关系。

**a11y 条款覆盖进度**（截至 R25）：
- WCAG 2.4.1 (A) Bypass Blocks — R7 ✓
- WCAG 3.1.2 (A) Language of Parts — R13 ✓
- WCAG 2.4.7 (AA) Focus Visible — R16 ✓
- WCAG 2.4.4 (A) Link Purpose — R24 ✓
- WCAG 1.3.1 (A) Info and Relationships — R25 ✓
- WCAG 1.4.3 (AA) Contrast (Minimum) — 已通过（颜色对比度计算验证）

5 项 WCAG A 级 + 2 项 AA 级条款覆盖，a11y 达"深"水平。
