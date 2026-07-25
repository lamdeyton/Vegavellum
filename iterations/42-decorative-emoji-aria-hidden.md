# R42：装饰性 emoji aria-hidden 标注（WCAG 1.1.1 同型遗漏补全）

## 触发（外部压力）

R41 完成后三类审计发现 validator 健壮性已达十二层闭环，未发现 CRITICAL gap。转向 a11y 角度审计，发现 WCAG 1.1.1 (A) Non-text Content 的同型遗漏：

- **CategoryList.astro** 和 **[id].astro h1 标题** 的 emoji 已标 `aria-hidden="true"` ✓
- 但 **Base.astro header 导航**、**[id].astro 面包屑当前页**、**[slug].astro 面包屑分类链接** 的 emoji 未标 `aria-hidden` ❌

这是同型遗漏：同一数据字段（`category.icon`/`c.icon`）在不同渲染位置使用了不同的 a11y 处理。

## Gap 描述

**屏幕阅读器行为**：

`{c.icon} {c.name}` 渲染为 `🎨 前端框架`。屏幕阅读器对 emoji 的处理不一致：
- NVDA（Windows）：读出"画家调色板 前端框架"
- VoiceOver（macOS）：读出"艺术调色板 前端框架"或"image 前端框架"
- Narrator（Windows）：读出"emoji 前端框架"

用户听到"画家调色板"会困惑，不知道这是什么。装饰性 emoji 应标 `aria-hidden="true"`，让屏幕阅读器只读文本部分（"前端框架"）。

**3 处遗漏位置**：

| 文件 | 行 | 上下文 | 修复前 | 修复后 |
|------|-----|--------|--------|--------|
| `Base.astro` | 74 | header 导航链接 | `{c.icon} {c.name}` | `<span aria-hidden="true">{c.icon}</span> {c.name}` |
| `[id].astro` | 49 | 面包屑当前页 | `{category.icon} {category.name}` | `<span aria-hidden="true">{category.icon}</span> {category.name}` |
| `[slug].astro` | 54 | 面包屑分类链接 | `{category.icon} {category.name}` | `<span aria-hidden="true">{category.icon}</span> {category.name}` |

**已正确的位置**（无需修改）：

| 文件 | 行 | 上下文 | 状态 |
|------|-----|--------|------|
| `CategoryList.astro` | 19 | 分类列表项 | `<span class="icon" aria-hidden="true">{c.icon}</span>` ✓ |
| `[id].astro` | 52 | h1 标题 | `<span class="icon" aria-hidden="true">{category.icon}</span>` ✓ |

## 修复

3 处修复均使用 `<span aria-hidden="true">{...icon}</span>` 包裹 emoji，与 CategoryList.astro 和 [id].astro h1 标题的同型处理对齐。

```astro
<!-- Base.astro header 导航 -->
<a href={`${base}/category/${c.id}/`}><span aria-hidden="true">{c.icon}</span> {c.name}</a>

<!-- [id].astro 面包屑当前页 -->
<span class="current" aria-current="page"><span aria-hidden="true">{category.icon}</span> {category.name}</span>

<!-- [slug].astro 面包屑分类链接 -->
<a href={`${base}/category/${category.id}/`}><span aria-hidden="true">{category.icon}</span> {category.name}</a>
```

## MVP 回归验证

- `npm run validate`：✓ 0 错误 0 警告（5 项目 9 分类）
- `npm run build`：✓ 16 页面构建成功
- HTML 产物验证：✓ 所有页面 `aria-hidden="true"` 正确应用到 emoji icon

## 教训（同型对齐模式再次确认）

**WCAG 1.1.1 同型遗漏模式**：同一数据字段（`category.icon`）在不同渲染位置的 a11y 处理不一致。教训扩展：

1. **同型字段同型 a11y**：同一字段在多个组件/页面渲染时，a11y 处理必须一致——装饰性图标在所有位置都应标 `aria-hidden`。
2. **审计范围扩展到 a11y**：R36-R41 聚焦 validator 健壮性，R42 转向 a11y。a11y 审计也应使用"同型对齐"模式——同一字段的所有渲染位置 a11y 处理必须一致。
3. **emoji 是 a11y 隐患**：emoji 是 Unicode 字符，技术上是"文本"，但屏幕阅读器处理不一致。装饰性 emoji 应标 `aria-hidden`，避免读出无关描述干扰导航。

**a11y 条款覆盖扩展**：R7/R13/R16/R24/R25/R42 = WCAG 2.4.1 (A) + 3.1.2 (A) + 2.4.7 (AA) + 2.4.4 (A) + 1.3.1 (A) + 1.1.1 (A)，6 项 A 级 + 1 项 AA 级。

## 文件变更

- `src/layouts/Base.astro`：header 导航 emoji 加 `aria-hidden`。
- `src/pages/category/[id].astro`：面包屑当前页 emoji 加 `aria-hidden`。
- `src/pages/project/[slug].astro`：面包屑分类链接 emoji 加 `aria-hidden`。
- `iterations/README.md`：新增 R42 条目 + a11y 条款覆盖更新。
- `iterations/42-decorative-emoji-aria-hidden.md`：本文件。
- `README.md`：a11y 描述同步 R42（WCAG 1.1.1）。
