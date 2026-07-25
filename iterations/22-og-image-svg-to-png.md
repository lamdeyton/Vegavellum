# R22 · og:image SVG → PNG 转换（社交平台不支持 SVG）

> 轮次类型：Vertical（实现 ↔ 外部规范契约）
> 触发：R21 后三类审计发现 — R17 创建的 og-image.svg 是 SVG 格式，但所有主要社交平台（Twitter / Facebook / LinkedIn / Slack）不支持 SVG 作为 og:image，R17 声称的"完整 OG/Twitter tags"实际在社交平台根本不渲染。

## 审计发现

### N1（CRITICAL · 实现 ↔ 外部规范）：og:image 是 SVG 格式，社交平台不支持

**症状**：

- R17 创建 `public/og-image.svg`（1200x630 SVG），Base.astro 注入：
  ```html
  <meta property="og:image" content=".../og-image.svg" />
  <meta name="twitter:image" content=".../og-image.svg" />
  ```
- 但行业规范：
  - **Facebook OG 协议**（ogp.me）：image 应为 JPEG / PNG / GIF，不支持 SVG
  - **Twitter Card** 官方文档：不支持 SVG
  - **LinkedIn**：不支持 SVG 预览
  - **Slack**：不支持 SVG unfurl
- 实际后果：分享 Vegavellum 链接到任何主流社交平台，预览图区域**空白或显示破图标**
- 比 R17 之前（没有 og:image）更糟糕：image meta tag 存在但加载失败，影响平台对链接的评分

**根本原因**：R17 选择 SVG 是为了"可编辑、文本可搜索"，但没有验证目标平台（社交平台）是否支持。这是典型的"实现层与外部规范契约不一致"。

**证伪测试**：
- 用 Twitter Card Validator（https://cards-dev.twitter.com/validator）检查：SVG 不渲染
- 用 Facebook Sharing Debugger（https://developers.facebook.com/tools/debug/）检查：报 "og:image" warning
- 这是真实外部规范约束，非想象需求

## 修复方案

**策略**：保留 og-image.svg 作为可编辑源文件，新增 og-image.png 作为社交平台实际使用的格式。

### 1. 生成 og-image.png

使用 macOS 自带 `sips` 工具将 SVG 转 PNG（无需引入 sharp 等 Node 依赖）：

```bash
sips -s format png public/og-image.svg --out public/og-image.png
```

- 输出：1200x630, 8-bit RGBA PNG, 48KB（合理）
- 保留 og-image.svg 作为源文件（未来设计迭代可编辑）
- 仓库内提交 PNG，CI 不需要重新生成（零运行时依赖）

### 2. Base.astro 改引用 og-image.png

```diff
- <meta property="og:image" content={`${siteUrl}${base}/og-image.svg`} />
+ <meta property="og:image" content={`${siteUrl}${base}/og-image.png`} />
+ <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />

- <meta name="twitter:image" content={`${siteUrl}${base}/og-image.svg`} />
+ <meta name="twitter:image" content={`${siteUrl}${base}/og-image.png`} />
```

- 新增 `og:image:type` meta tag 明确声明 MIME 类型（社交平台解析更可靠）

## 验证

- `npm run validate` 通过
- `ASTRO_TELEMETRY_DISABLED=1 npm run build` 通过
- 构建产物 `dist/index.html` 包含 `og-image.png` 引用，无 `og-image.svg` 残留
- `dist/og-image.png` 存在（被 Astro 复制到产物根）
- PNG 文件完整性：`file public/og-image.png` → "PNG image data, 1200 x 630, 8-bit/color RGBA, non-interlaced"

## 6 子目标深度演进

| 子目标 | R21 | R22 |
|--------|-----|-----|
| 1. 数据完整性 | 深+ | 深+ |
| 2. 路由正确性 | 深+ | 深+ |
| 3. 可访问性 | 深 | 深 |
| 4. SEO/元数据 | 深+ | 深+（og:image 实际可被社交平台渲染，从"虚假完整"到"真实完整"） |
| 5. 部署链路 | 深+ | 深+ |
| 6. 可扩展性 | 深+ | 深+（保留 SVG 源 + PNG 产物的双轨制，未来设计迭代可编辑） |

## 教训

**"完整 OG tags"不等于"OG tags 真正可用"**：

R17 当时声称"创建 1200x630 SVG + 完整 OG/Twitter tags"并标记为"已完成"，但实际上：
- OG tags 字段完整（title/description/image/width/height/alt）✓
- 但 image 引用的格式不被目标平台支持 ✗

这是 Vertical gap：实现层（HTML meta tags）与外部规范层（社交平台支持的图片格式）契约不一致。

**未来 SEO/社交相关改动的验证清单**：
- og:image / twitter:image 必须是 PNG/JPEG/GIF，不能是 SVG
- og:image 尺寸 ≥ 1200x630（已满足）
- og:image 文件大小 < 8MB（已满足，48KB）
- og:url 必须是绝对 URL 且与 canonical 一致（已满足）
- 用 Facebook Sharing Debugger / Twitter Card Validator 实际验证（CI 无法做，需手动）

**更普遍的教训**：当某项实现"看似完整"时，必须问"目标消费方（搜索引擎/社交平台/屏幕阅读器/浏览器）真的支持这个格式/语法吗？"。R17 只检查了"OG 协议规范"层，没检查"社交平台实际支持"层。这是典型的"接口规范 ≠ 实现支持"陷阱。
