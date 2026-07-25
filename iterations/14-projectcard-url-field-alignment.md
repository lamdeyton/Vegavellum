# R14 — ProjectCard 补全官网链接（url 字段 Horizontal gap）

> 超长程任务模式第十四轮。修复 R13 审计识别的字段使用对齐缺口。

## 触发原因

R13 完成后继续 horizontal 审计，检查 Project 接口字段在组件中的使用对齐。发现 `url` 字段在 Project 详情页显示，但在 ProjectCard 组件中未使用 —— 属 Horizontal gap（字段定义 ↔ 使用未对齐）。

## 审计发现

### N1（Horizontal · 字段使用对齐）：ProjectCard 未显示官网链接

**症状**：
- `Project` 接口有 `url?: string` 字段（src/lib/data.ts 第 24 行）
- Project 详情页（`src/pages/project/[slug].astro` 第 43-52 行）显示官网链接
- ProjectCard（`src/components/ProjectCard.astro`）接收 `project: Project` 但未使用 `url` 字段

**影响**：
- 用户在分类页浏览项目卡片时，只能看到 GitHub 链接，无法直接访问官网
- 对于有独立官网的项目（如 nextjs.org、astro.build、deno.land），用户需多一次点击（进详情页 → 点官网）
- url 字段在数据层存在但未在卡片层使用，违反"字段使用对齐"原则

**修复**：在 ProjectCard 的 card-meta 中，如果有 url，添加官网链接（与 GitHub 链接并列）：

```astro
{project.url && (
  <a class="url-link" href={project.url} target="_blank" rel="noopener noreferrer">
    官网 ↗
  </a>
)}
```

样式上，repo-link 用 accent 色（主链接），url-link 用 text-muted 色（次链接，hover 时变 accent），形成视觉层次。

## MVP 回归验证

```bash
ASTRO_TELEMETRY_DISABLED=1 npm run build
# ✓ 16 page(s) built in 524ms

grep -c "url-link" dist/category/dev-tools/index.html dist/category/frontend-framework/index.html
# dev-tools: 2（deno 官网链接 + 样式）
# frontend-framework: 3（nextjs + astro 官网链接 + 样式）
```

构建无回归，url-link 正确渲染。

## 子目标深度演进

R14 后，6 子目标状态：
1. **数据完整性 — 深+**（字段使用对齐补全）
2. 路由正确性 — 深+
3. 可访问性 — 深-
4. SEO/元数据 — 深+
5. 部署链路 — 深+
6. 可扩展性 — 深

## 模式总结：字段使用对齐

R14 是 horizontal 审计的第二次发现（R9 是 license 字段格式校验，属字段值校验；R14 是字段使用，属字段渲染）：

| 轮次 | 字段 | 类型 | 缺口 |
|------|------|------|------|
| R9 | license | 值校验 | SPDX canonical 未校验 |
| R11 | slug | 值校验 | URL-friendly 未校验 |
| R14 | url | 使用对齐 | 卡片层未渲染 |

**教训**：每个可选字段都应在所有接收该数据的组件中考虑是否渲染。如果某组件不渲染，应有明确设计理由（如 tags 在卡片不显示是因为空间限制）。

## 下一轮候选（R15 审计输入）

R14 完成后剩余候选：
- **Project 详情页"返回首页"应为面包屑**：返回所属分类更合理，UX gap
- **WCAG 2.4.7 Focus Visible**：未显式定义 :focus-visible 样式
- **og:image 缺失**：社交分享无预览图
- **ProjectCard tags 截断**：tags 过多时无截断，可能溢出
