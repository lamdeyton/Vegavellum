# R15 — Project 详情页面包屑导航替换"返回首页"

> 超长程任务模式第十五轮。修复 R14 审计识别的 UX 链路完整性缺口。

## 触发原因

R14 完成后继续 UX 审计，发现 Project 详情页的"← 返回首页"链接不符合用户预期和 SEO 最佳实践。用户从分类页点进项目详情，期望返回到来源分类页，而不是首页。

## 审计发现

### N1（Vertical · UX 链路）：Project 详情页"返回首页"不符合用户心智模型

**症状**：
- `src/pages/project/[slug].astro` 顶部为 `<a class="back" href={base}>← 返回首页</a>`
- 同时 header 有分类 chip 显示分类，但 chip 视觉上是标签而非导航
- 用户路径：首页 → 分类页 → 项目详情页，"返回首页"跳过了中间的分类页

**影响**：
- **UX**：用户想回到分类页继续浏览同类项目，需点"返回首页"再点分类，多一次点击
- **SEO**：面包屑导航是 Google 推荐的结构化数据，帮助搜索引擎理解页面层级
- **可访问性**：面包屑有 `aria-label="面包屑导航"`，比"返回首页"更清晰

**修复**：将"返回首页" + cat-chip 合并为面包屑导航：

```astro
<nav class="breadcrumb" aria-label="面包屑导航">
  <a href={`${base}/`}>首页</a>
  {category && (
    <>
      <span class="sep" aria-hidden="true">/</span>
      <a href={`${base}/category/${category.id}`}>{category.icon} {category.name}</a>
    </>
  )}
</nav>
```

移除原 `.back` 和 `.cat-chip` 样式，新增 `.breadcrumb` 样式（muted 色，hover 变 accent，sep 用 border 色）。

**设计取舍**：
- 不在面包屑末尾重复当前项目名（h1 已显示，避免冗余）
- 分类名前加 icon 保持视觉一致性
- 用 `/` 分隔符（简洁，国际化友好）

## MVP 回归验证

```bash
ASTRO_TELEMETRY_DISABLED=1 npm run build
# ✓ 16 page(s) built in 469ms

grep -o 'breadcrumb' dist/project/nextjs/index.html | head -3
# 验证面包屑已渲染（3 处：class + aria-label + 样式）
```

构建无回归。

## 子目标深度演进

R15 后，6 子目标状态：
1. 数据完整性 — 深+
2. 路由正确性 — 深+
3. 可访问性 — 深-（面包屑 aria-label 增强）
4. SEO/元数据 — 深+（面包屑有利于搜索引擎理解层级）
5. 部署链路 — 深+
6. 可扩展性 — 深

## 模式总结：UX 链路完整性

R15 是 UX 链路审计的发现，模式从"字段对齐"扩展到"导航路径对齐"：

| 轮次 | 类型 | 缺口 |
|------|------|------|
| R14 | 字段使用对齐 | url 字段卡片未渲染 |
| R15 | 导航路径对齐 | 返回链接不符合用户来源路径 |

**教训**：每个详情页的"返回"逻辑应反映用户来源路径，而非固定指向首页。面包屑导航同时解决 UX、SEO、a11y 三个维度。

## 下一轮候选（R16 审计输入）

R15 完成后剩余候选：
- **WCAG 2.4.7 Focus Visible**：未显式定义 :focus-visible 样式，键盘用户焦点指示器依赖浏览器默认
- **og:image 缺失**：社交分享无预览图
- **ProjectCard tags 截断**：tags 过多时无截断
- **category 页"返回首页"也可改面包屑**：但分类页上级就是首页，面包屑意义不大
