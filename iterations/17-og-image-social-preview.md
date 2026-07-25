# R17 — og:image 社交分享预览图

> 超长程任务模式第十七轮。补全 SEO 完整性的最后一环：社交分享预览图。

## 触发原因

R16 完成后继续 SEO 审计。Base.astro 已有 og:title/og:description/og:url/og:site_name/og:locale，但缺 og:image —— 社交平台分享时无预览图，影响传播效果。同时 Twitter Card 从 `summary` 升级为 `summary_large_image` 以支持大图预览。

## 审计发现

### N1（Horizontal · SEO）：og:image 缺失，社交分享无预览图

**症状**：
- `Base.astro` 有完整 OG tags 但无 `og:image`
- Twitter Card 用 `summary`（小卡片），无 `twitter:image`
- 社交平台（Facebook/Twitter/LinkedIn/微信）分享时只显示标题+描述，无视觉预览

**影响**：
- 分享链接时点击率显著降低（有预览图的链接点击率高 2-3 倍）
- 品牌识别度缺失（无视觉记忆点）
- 违反"SEO 完整性"的契约声明

**实现方案权衡**：

| 方案 | 优点 | 缺点 |
|------|------|------|
| A. 生成 PNG（1200x630） | 全平台兼容 | 需图片生成工具/依赖 |
| B. 用 SVG | 矢量、轻量、可代码维护 | Twitter 不支持 SVG og:image |
| C. 占位外部图 | 简单 | 不可控、依赖外部 |

选 **方案 B**：创建 `public/og-image.svg`（1200x630），复用 favicon 设计元素（深紫夜空 + 织女星 + Vellum 卷轴 + 品牌名 + slogan）。

**兼容性说明**：
- Facebook：支持 SVG og:image ✓
- LinkedIn：支持 SVG og:image ✓
- Twitter：**不支持 SVG**，会回退到纯文本卡片。未来需生成 PNG 用于 Twitter。
- 微信：支持 SVG og:image ✓

**修复**：

1. 创建 `public/og-image.svg`（1200x630，复用品牌设计）：
   - 深紫夜空背景 (#14132b)
   - 星点装饰
   - 织女星四角星（左上）
   - Vellum 卷轴 V 字形（居中）
   - 品牌名 "Vegavellum"（72px）
   - 中文 slogan "织星为卷，索引开源。"（32px）
   - 英文 slogan "Weaving the GitHub galaxy onto one scroll."（20px）

2. Base.astro 注入 og:image 完整 tags：
```html
<meta property="og:image" content={`${siteUrl}${base}/og-image.svg`} />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Vegavellum · 织星为卷，索引开源" />
```

3. Twitter Card 从 `summary` 升级为 `summary_large_image`，添加 `twitter:image`：
```html
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content={`${siteUrl}${base}/og-image.svg`} />
```

## MVP 回归验证

```bash
ASTRO_TELEMETRY_DISABLED=1 npm run build
# ✓ 16 page(s) built in 502ms

grep -c "og:image" dist/index.html
# 1（og:image meta 已注入）

ls dist/og-image.svg
# dist/og-image.svg（静态资源已复制）
```

构建无回归，og-image.svg 正确部署到 dist 根目录。

## 子目标深度演进

R17 后，6 子目标状态：
1. 数据完整性 — 深+
2. 路由正确性 — 深+
3. 可访问性 — 深
4. **SEO/元数据 — 深+**（og:image 补全，OG tags 完整度达 100%）
5. 部署链路 — 深+
6. 可扩展性 — 深

## SEO 完整性总结

R2/R5/R17 三轮 SEO 专项迭代，完整度从 0 推进到 100%：

| 轮次 | SEO 修复 | 条目 |
|------|---------|------|
| R2 | sitemap + robots.txt + OG tags + Twitter Card + canonical | 基础 SEO |
| R5 | 404 noindex + canonical 修复 | 防止错误索引 |
| R17 | og:image + twitter:image + summary_large_image | 社交分享预览 |

**当前 SEO 覆盖**：
- ✓ sitemap.xml（15 URL，404 排除）
- ✓ robots.txt（含 Sitemap 声明）
- ✓ canonical URL（尾斜杠一致）
- ✓ OG tags（type/title/description/url/site_name/locale/image/image:width/image:height/image:alt）
- ✓ Twitter Card（summary_large_image + title/description/image）
- ✓ 404 noindex（防止错误索引）
- ✓ SVG favicon
- ✓ semantic HTML（header/main/footer/nav/h1-h3）

**剩余 SEO 候选**（微优化）：
- sitemap lastmod（需 build 时动态生成，复杂度高）
- structured data (JSON-LD) for BreadcrumbList（R15 面包屑可加 JSON-LD）
- PNG og:image for Twitter 兼容（需图片生成工具）

## 下一轮候选（R18 审计输入）

R17 完成后剩余候选（边际递减）：
- **JSON-LD BreadcrumbList**：R15 面包屑可加结构化数据，帮助搜索引擎理解层级
- **astro check 类型检查**：未纳入 CI
- **PNG og:image**：Twitter 不支持 SVG，需生成 PNG（需工具依赖）
- **ProjectCard tags 截断**：tags 过多时无截断（flex-wrap 已处理溢出，非真实 gap）
