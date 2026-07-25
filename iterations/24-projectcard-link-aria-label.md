# R24 · ProjectCard 链接 aria-label（WCAG 2.4.4 Link Purpose）

> 轮次类型：Horizontal（a11y 字段↔使用对齐）
> 触发：R23 后三类审计发现 — ProjectCard 中"GitHub ↗"和"官网 ↗"链接文本在多个卡片中重复，屏幕阅读器用户听到"GitHub, GitHub, GitHub..."无法区分是哪个项目的链接。

## 审计发现

### N1（Horizontal · a11y）：ProjectCard 重复链接文本缺少 aria-label

**症状**：

`src/components/ProjectCard.astro` 中：

```astro
<a class="repo-link" href={repoUrl} target="_blank" rel="noopener noreferrer">
  GitHub ↗
</a>
{project.url && (
  <a class="url-link" href={project.url} target="_blank" rel="noopener noreferrer">
    官网 ↗
  </a>
)}
```

在分类页（如 `/category/frontend-framework/`）有 5 个 ProjectCard 时：

- 5 个"GitHub ↗"链接文本完全相同
- 屏幕阅读器朗读："链接 GitHub，链接 GitHub，链接 GitHub..."（或屏幕阅读器快捷键 Tab 跳链接时只能听到"GitHub"）
- 用户无法区分是 Next.js 的 GitHub 还是 Astro 的 GitHub
- 违反 WCAG 2.4.4 Link Purpose (In Context) (Level A)："A mechanism is available which allows the purpose of each link to be identified from link text alone, or from link text together with its programmatically determined link context"

**根本原因**：

- 视觉用户可以通过卡片上下文（卡片标题、描述）推断"GitHub ↗"指向哪个项目
- 但屏幕阅读器用户在链接间跳转时（Tab/Shift+Tab 或快捷键），脱离上下文，只能听到链接文本本身
- "GitHub ↗" + 卡片上下文 视觉上够用，但纯链接文本不够 → 需要 `aria-label` 补充

**外部规范依据**：

WCAG 2.4.4 Link Purpose (In Context) (Level A)：
- 链接文本本身，或链接文本 + 程序化确定的上下文，应能说明链接目的
- 当链接文本不够时，`aria-label` 是最直接的补充方式

**证伪测试**：

- 验证方式：`dist/category/frontend-framework/index.html` 中每个 repo-link 有 `aria-label="<项目名> GitHub 仓库"`
- 外部压力：WCAG 2.4.4 (A) 是真实规范，是 a11y 三大基础条款之一

## 修复方案

### `src/components/ProjectCard.astro`

为重复文本链接添加 `aria-label`，包含项目名以区分：

```astro
<a class="repo-link"
   href={repoUrl}
   target="_blank"
   rel="noopener noreferrer"
   aria-label={`${project.name} GitHub 仓库`}>
  GitHub ↗
</a>
{project.url && (
  <a class="url-link"
     href={project.url}
     target="_blank"
     rel="noopener noreferrer"
     aria-label={`${project.name} 官网`}>
    官网 ↗
  </a>
)}
```

**设计取舍**：

- 链接可见文本保持"GitHub ↗"/"官网 ↗"不变（视觉简洁）
- `aria-label` 覆盖可访问名称（accessible name），屏幕阅读器读"Next.js GitHub 仓库"而非"GitHub ↗"
- 详情链接 `<a href="...">{project.name}</a>` 不需要 aria-label，因为文本本身已是项目名（独特）
- 不用 `aria-labelledby`（无对应的可见标签元素）

## 验证

- `npm run validate` 通过
- `ASTRO_TELEMETRY_DISABLED=1 npm run build` 通过
- 构建产物 `dist/category/frontend-framework/index.html` 中：
  - 每个 repo-link 有 `aria-label="Next.js GitHub 仓库"` / `"Astro GitHub 仓库"` 等（项目名独特）
  - 每个 url-link 有 `aria-label="Next.js 官网"` / `"Astro 官网"` 等

## 6 子目标深度演进

| 子目标 | R23 | R24 |
|--------|-----|-----|
| 1. 数据完整性 | 深+ | 深+ |
| 2. 路由正确性 | 深+ | 深+ |
| 3. 可访问性 | 深 | 深（WCAG 2.4.4 Link Purpose (A) 新增，a11y 条款覆盖 +1） |
| 4. SEO/元数据 | 深+ | 深+ |
| 5. 部署链路 | 深+ | 深+ |
| 6. 可扩展性 | 深+ | 深+ |

## 教训

**a11y 审计不止于"是否有 focus/skip-link/lang"，还要看每个交互元素的"可访问名称"是否独特**：

- R7/R13/R16/R20 关注的是机制（skip-link / lang / focus-visible / aria-current）
- R24 关注的是内容（链接文本是否独特）

未来 a11y 审计清单新增一项：
- **所有重复文本的交互元素（链接/按钮）是否有 aria-label 区分**？
  - 卡片中的"详情"/"GitHub"/"官网"
  - 列表中的"删除"/"编辑"
  - 分页中的"上一页"/"下一页"

**a11y 条款覆盖进度**（截至 R24）：
- WCAG 2.4.1 (A) Bypass Blocks — R7 ✓
- WCAG 3.1.2 (A) Language of Parts — R13 ✓
- WCAG 2.4.7 (AA) Focus Visible — R16 ✓
- WCAG 2.4.4 (A) Link Purpose — R24 ✓
- WCAG 1.3.1 (A) Info and Relationships — 待审计
- WCAG 1.4.3 (AA) Contrast (Minimum) — 已通过（颜色对比度计算验证）
