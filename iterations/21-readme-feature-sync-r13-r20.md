# R21 · README 功能描述同步 R13-R20 实现

> 轮次类型：Horizontal（README ↔ 实现 对齐）
> 触发：R20 后三类审计发现 — README "功能" 节描述滞后于 R13-R20 共 8 轮迭代的实现，违反 R12 确立的"README 必须反映最新实现"标准。

## 审计发现

### N1（Horizontal · 文档↔实现）：README 功能描述滞后

**症状**：

README.md 第 87-92 行当前功能描述：

```
- **精选目录**：扁平分类，9 个类别覆盖主流领域
- **静态站点**：Astro 4 构建，零 JS 默认，SEO 友好
- **数据校验**：`npm run validate` 检查 YAML 契约（...）
- **SEO 完整**：sitemap.xml、robots.txt、OG tags、Twitter Card、canonical URL、SVG favicon
- **CI/CD**：GitHub Actions 自动校验 + 构建 + 部署到 GitHub Pages
- **贡献友好**：CONTRIBUTING.md 详述数据格式与提交流程
```

未提到的 R13-R20 新增功能：

| 轮次 | 实现内容 | README 是否提及 |
|------|---------|----------------|
| R7/R13/R16 | WCAG 2.4.1 (A) skip-link + 3.1.2 (A) lang + 2.4.7 (AA) focus-visible | ✗ 完全未提可访问性 |
| R15/R20 | project + category 页面包屑导航 | ✗ 未提 |
| R17 | og:image 社交分享预览图 | ✗ 未提 |
| R18/R20 | JSON-LD BreadcrumbList 结构化数据 | ✗ 未提 |
| R19 | sources 字段用户友好中文显示 | ✗ 不属于 README 范畴（实现细节，跳过） |

**根本原因**：R12 之后每轮迭代都更新了 iterations/README.md，但项目根 README.md 没有同步更新。R12 的教训"每声明一条契约必须同步加 validator"未推广为"每实现一项功能必须同步更新 README"。

## 修复方案

更新 README.md "功能" 节，新增/补充：

1. **可访问性**（新增条目）：WCAG 2.4.1 (A) skip-link + 3.1.2 (A) lang 属性 + 2.4.7 (AA) focus-visible
2. **SEO 完整**（扩充）：补充 og:image 社交预览图、JSON-LD BreadcrumbList 结构化数据、面包屑导航
3. **导航体验**（新增条目，可选）：project 和 category 页面包屑导航

## 实施变更

### README.md "功能" 节改为：

```markdown
## 功能

- **精选目录**：扁平分类，9 个类别覆盖主流领域
- **静态站点**：Astro 4 构建，零 JS 默认，SEO 友好
- **数据校验**：`npm run validate` 检查 YAML 契约（category 引用、slug 文件名一致性与 URL-friendly 格式、必填字段、status/sources 枚举、repo 格式、addedAt 日期、license SPDX canonical、url 冗余）
- **SEO 完整**：sitemap.xml、robots.txt、OG tags + og:image 社交预览图、Twitter Card、canonical URL、noindex（404）、JSON-LD BreadcrumbList 结构化数据、SVG favicon
- **可访问性**：WCAG 2.4.1 (A) skip-link 跳转主内容、3.1.2 (A) 英文内容 `lang="en"` 标注、2.4.7 (AA) `:focus-visible` 键盘焦点样式
- **导航体验**：project 和 category 详情页统一面包屑导航（首页 > 分类 > 当前页）
- **CI/CD**：GitHub Actions 自动校验 + 构建 + 部署到 GitHub Pages
- **贡献友好**：CONTRIBUTING.md 详述数据格式与提交流程
```

## 验证

- `npm run validate` 通过
- `ASTRO_TELEMETRY_DISABLED=1 npm run build` 通过
- README.md 内容视觉检查（无渲染问题）
- "功能" 节每条都对应真实实现（证伪检查通过）

## 6 子目标深度演进

| 子目标 | R20 | R21 |
|--------|-----|-----|
| 1. 数据完整性 | 深+ | 深+ |
| 2. 路由正确性 | 深+ | 深+ |
| 3. 可访问性 | 深 | 深（README 公开声明 WCAG 标准，外部可见） |
| 4. SEO/元数据 | 深+ | 深+（README 公开声明 og:image + JSON-LD） |
| 5. 部署链路 | 深+ | 深+ |
| 6. 可扩展性 | 深+ | 深+ |

## 教训

**R12 教训的推广**：R12 当时确立"每声明一条契约必须同步加 validator"。本轮推广为更普遍的"**每实现一项功能必须同步更新 README**"。

文档同步是 Horizontal 审计的常规项，每轮迭代后都应检查 README / CONTRIBUTING / 设计文档是否反映最新实现。R12 之后又积累了 8 轮迭代未同步，是审计不够严格的体现。

**未来每轮迭代结束前的文档检查清单**：
- 是否新增/修改了用户可见功能？→ 同步更新 README "功能" 节
- 是否新增/修改了贡献者契约？→ 同步更新 CONTRIBUTING.md
- 是否新增/修改了校验规则？→ 同步更新 CONTRIBUTING.md 数据格式说明
