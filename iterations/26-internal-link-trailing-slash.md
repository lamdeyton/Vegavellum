# R26：站内导航链接尾斜杠一致性

> 类型：Connection gap（R7 修复未传播）
> 触发：R25 后三类审计发现
> 子目标影响：2. 路由正确性、4. SEO/元数据

## 背景

R7 修复了 canonical URL 的尾斜杠一致性（与 Astro 默认 `build.format: 'directory'` 对齐，子页面 canonical 统一带尾斜杠）。R20/R23 的 JSON-LD BreadcrumbList 和 WebSite 也使用了带尾斜杠的 URL。

R25 后做 Connection audit 时发现：R7 的修复**只传播到了 canonical/sitemap/JSON-LD**，**未传播到站内导航链接**（header nav / CategoryList / ProjectCard / project 页面包屑）。

## 抓到的 bug

### N1（CRITICAL）站内导航链接与 canonical URL 尾斜杠不一致

**证据**（修复前 `dist/category/ai-ml/index.html`）：

| 资源 | URL | 尾斜杠 |
|------|-----|--------|
| `<link rel="canonical">` | `https://lamdeyton.github.io/Vegavellum/category/ai-ml/` | ✓ 带 |
| `<meta property="og:url">` | `https://lamdeyton.github.io/Vegavellum/category/ai-ml/` | ✓ 带 |
| JSON-LD BreadcrumbList item | `https://lamdeyton.github.io/Vegavellum/category/ai-ml/` | ✓ 带 |
| sitemap.xml `<loc>` | `https://lamdeyton.github.io/Vegavellum/category/ai-ml/` | ✓ 带 |
| header nav 分类链接 | `/Vegavellum/category/ai-ml` | ✗ **不带** |
| 首页 CategoryList 分类链接 | `/Vegavellum/category/ai-ml` | ✗ **不带** |
| ProjectCard 项目链接 | `/Vegavellum/project/langchain` | ✗ **不带** |
| project 详情页面包屑分类链接 | `/Vegavellum/category/ai-ml` | ✗ **不带** |

**影响**：
1. **性能**：Astro `build.format: 'directory'` 生成 `category/ai-ml/index.html`，用户访问 `/category/ai-ml`（不带斜杠）时 GitHub Pages 静态服务器需 301 重定向到 `/category/ai-ml/`。每次站内导航都多一次重定向，增加延迟。
2. **SEO**：canonical（带斜杠）与站内链接（不带斜杠）形式不一致，搜索引擎可能视为混合信号，影响页面规范化（canonicalization）。
3. **契约一致性**：R7 的修复只覆盖了"对外声明"层（canonical/sitemap/JSON-LD），未覆盖"内部链接"层，是典型的 connection audit 应抓的 gap。

## 修复方案

4 处站内导航链接统一加尾斜杠，与 canonical/sitemap/JSON-LD 对齐：

### `src/layouts/Base.astro`（header nav）

```diff
- <a href={`${base}/category/${c.id}`}>{c.icon} {c.name}</a>
+ <a href={`${base}/category/${c.id}/`}>{c.icon} {c.name}</a>
```

### `src/components/CategoryList.astro`（首页分类卡片）

```diff
- <a class="cat-item" href={`${base}/category/${c.id}`}>
+ <a class="cat-item" href={`${base}/category/${c.id}/`}>
```

### `src/components/ProjectCard.astro`（项目卡片标题链接）

```diff
- <a href={`${base}/project/${project.slug}`}>{project.name}</a>
+ <a href={`${base}/project/${project.slug}/`}>{project.name}</a>
```

### `src/pages/project/[slug].astro`（项目详情页面包屑分类链接）

```diff
- <a href={`${base}/category/${category.id}`}>{category.icon} {category.name}</a>
+ <a href={`${base}/category/${category.id}/`}>{category.icon} {category.name}</a>
```

**无需修改**：
- 首页链接 `${base}/`（已带斜杠）
- 404 "返回首页" `${base}/`（已带斜杠）
- category empty-cta `${base}/`（已带斜杠）
- 面包屑"首页"链接 `${base}/`（已带斜杠）
- JSON-LD item 字段（R7/R20 已带斜杠）

## MVP 回归

```
✓ npm run validate（0 错误 0 警告）
✓ npm run build（16 页面构建完成）
✓ 产物验证：grep 所有 href="/Vegavellum/(category|project)/[^"]*"
   - 不带尾斜杠：0 条（修复前 14 条）
   - 带尾斜杠：14 条（9 category + 5 project，全部正确）
```

## 审计反思

这一轮再次验证 long-range-task-execution 的核心论点：

> **Default behavior: When you feel done, you're not done. Audit.**

R25 完成时"感觉做完了"——MVP 回归通过、三类审计已多次执行。但 R25 后的 Connection audit 仍抓到了 R7 的传播 gap：一个**已修复 18 轮**的 bug（R7 canonical 尾斜杠）的修复未完全传播到所有层。

教训：**修复一个 bug 后，必须 audit 该 bug 涉及的"契约面"的所有层是否对齐**。R7 修复了 canonical，但未审视"还有哪些地方表达了同一 URL"——sitemap、JSON-LD、站内链接都属于同一契约面，必须全部对齐。
