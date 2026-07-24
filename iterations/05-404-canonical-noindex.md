# R5：404 canonical 修复 + 契约执行补强

> 触发：R4 收口轮提交后，按长程任务协议强制执行主动三类审计。审计发现 R4-N1 的尾斜杠修复暴露了一个更深的 bug（404 canonical 指向不存在的 URL），以及两处"声明但未执行"的契约。
>
> 经验印证：R4 写了"可以收口"，但主动审计立刻发现 3 个真实 gap。这正是"感觉做完了，其实没做完"的实证。

## 审计发现

### N1（CRITICAL · Connection）：404 canonical 指向不存在的 URL

**症状**：[src/pages/404.astro](file:///Users/lamdeyton/Library/Application%20Support/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a6300d9dbe95cc4e806642c/src/pages/404.astro) 传 `path="404"`，R4-N1 修复后 Base.astro 生成的 canonical 为 `https://lamdeyton.github.io/Vegavellum/404/`。

**根因**：Astro 对 `404.astro` 的构建产物是 `dist/404.html`（单文件），不是 `dist/404/index.html`（目录）。所以 URL `/Vegavellum/404/` 在部署后本身返回 404——canonical 指向一个会返回 404 状态码的 URL。

**后果**：
- canonical URL 返回 404 → 搜索引擎视为 SEO 错误
- 404.html 被 GitHub Pages 用于响应**任意**未匹配路径，给它一个自引用 canonical 在语义上就是错的（一个页面不能是无限个 URL 的 canonical）
- sitemap 正确地不包含 404（构建日志确认 `grep -c "404" dist/sitemap-0.xml` = 0），但 canonical 仍错误地自引用

**验证证据**：
```
dist/404.html 构建路径：/404.html（非 /404/index.html）
dist/404.html 修复前 canonical：.../Vegavellum/404/  ← 该 URL 部署后返回 404
dist/sitemap-0.xml 中 404 出现次数：0
```

**修复**：
1. [src/layouts/Base.astro](file:///Users/lamdeyton/Library/Application%20Support/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a6300d9dbe95cc4e806642c/src/layouts/Base.astro) 新增 `noindex?: boolean` prop。当 `noindex=true`：
   - 输出 `<meta name="robots" content="noindex">`
   - 跳过 `<link rel="canonical">`
   - 跳过 `og:url`
2. [src/pages/404.astro](file:///Users/lamdeyton/Library/Application%20Support/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a6300d9dbe95cc4e806642c/src/pages/404.astro) 改为 `noindex={true}` 并移除 `path="404"`。

### N2（Horizontal）：addedAt 日期格式声明但未校验

**症状**：[CONTRIBUTING.md](file:///Users/lamdeyton/Library/Application%20Support/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a6300d9dbe95cc4e806642c/CONTRIBUTING.md) 声明 `addedAt: 2026-07-24  # 收录日期（YYYY-MM-DD）`，但 [scripts/validate-data.mjs](file:///Users/lamdeyton/Library/Application%20Support/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a6300d9dbe95cc4e806642c/scripts/validate-data.mjs) 只校验非空，不校验格式。

**后果**：贡献者写 `addedAt: July 24` 或 `addedAt: 2026/07/24` 都能通过校验，进入数据集后破坏日期一致性。

**修复**：在 validate 脚本必填字段检查后加正则：
```javascript
if (p.addedAt && !/^\d{4}-\d{2}-\d{2}$/.test(p.addedAt)) {
  fail(`${label}: addedAt "${p.addedAt}" 不是 YYYY-MM-DD 格式`);
}
```

**可证伪性验证**（关键）：
```
临时写入 data/projects/bad-date-test.yaml，addedAt: July 24
  → npm run validate
  ✗ bad-date-test.yaml: addedAt "July 24" 不是 YYYY-MM-DD 格式
  错误：1
  ✗ 数据校验失败
删除临时文件后重新校验
  → 错误：0  警告：0  ✓ 数据校验通过
```
校验逻辑真实生效，非想象需求。

### N3（Horizontal）：license SPDX 标识符大小写不规范

**症状**：CONTRIBUTING.md 声明 `license: mit  # SPDX 标识符`，但 SPDX 规范的 canonical 形式是大小写敏感的（`MIT`、`Unlicense`、`Apache-2.0`）。5 个种子项目的 license 全用小写：4 个 `mit`、1 个 `unlicense`。

**后果**：`mit` 不是合法 SPDX 标识符；下游依赖 SPDX 的工具（license scanner、SBOM 生成器）可能识别失败。

**修复**：
- normalize 5 个项目 YAML：`mit` → `MIT`，`unlicense` → `Unlicense`
- 更新 CONTRIBUTING.md 示例为 `license: MIT  # SPDX 标识符（canonical 形式，如 MIT / Apache-2.0 / Unlicense）`

## MVP 回归验证

```
npm run validate
  ✓ 校验 5 个项目文件、9 个分类
  ✓ 错误：0  警告：0

ASTRO_TELEMETRY_DISABLED=1 npm run build
  ✓ 16 page(s) built in 497ms
  ✓ sitemap-index.xml created

404 页面 SEO 验证（修复后）：
  ✓ dist/404.html 含 <meta name="robots" content="noindex">
  ✓ dist/404.html rel="canonical" 计数 = 0（无 canonical）
  ✓ dist/404.html og:url 计数 = 0（无 og:url）

正常页面 SEO 验证（未受影响）：
  ✓ dist/index.html canonical: .../Vegavellum/
  ✓ dist/index.html noindex 计数 = 0
  ✓ dist/category/cli/ canonical: .../Vegavellum/category/cli/

addedAt 校验可证伪性测试：
  ✓ bad-date-test.yaml (addedAt: July 24) → 校验失败，错误：1
  ✓ 删除后 → 0 错误，校验通过

license 数据验证：
  ✓ 4 个 mit → MIT，1 个 unlicense → Unlicense
```

## 子目标进展

| 子目标 | R4 后 | R5 后 |
|--------|-------|-------|
| 1. 数据完整性 | 深 | **深+**（新增 addedAt 格式校验 + license SPDX 规范化） |
| 2. 路由正确性 | 深 | 深 |
| 3. 可访问性 | 中 | 中 |
| 4. SEO/元数据 | 深 | **深+**（404 noindex 修复 canonical 指向 404 的 SEO bug） |
| 5. 部署链路 | 深 | 深 |
| 6. 可扩展性 | 深 | 深 |

## 经验教训

1. **R4-N1 的尾斜杠修复是一个"接通型"修复**：它对齐了子页面的 canonical 与 sitemap，但暴露了 404 这个特殊页面的 canonical 本就错误（只是 R4 前路径不带斜杠时，错误更隐蔽）。修复一处契约对齐往往会暴露下一层的契约违例——这正是 friction chain。
2. **404.html 是静态站点的特殊路径**：它不是目录路由，是 GH Pages 的兜底文件。任何给 404 加自引用 canonical 的实现都是错的，正确做法是 noindex。
3. **"声明但未执行"契约是审计的高价值靶点**：addedAt 格式、license SPDX 都是 CONTRIBUTING 里白纸黑字写了但 validator 没查的。这类 gap 比想象的功能需求更真实。

## 下轮计划

继续主动三类审计。重点检查：
- 子目标 3（可访问性）仍为"中"，是否有 MVP 范围内可做深的真实摩擦（非 a11y 全面审计）
- 数据层是否还有声明未执行的契约（url 字段与 repo 重复等数据质量问题）
- 构建产物层面是否还有不一致
