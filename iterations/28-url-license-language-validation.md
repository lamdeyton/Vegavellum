# R28：url 格式 + license/language 类型校验

> 类型：声明但未执行的契约（同 R6/R8/R9/R11/R27 模式，扩展补全）
> 触发：R27 后水平审计发现 Project interface 字段类型校验不完整
> 子目标影响：1. 数据完整性

## 背景

R27 修复了 tags 字段类型校验后，水平审计 Project interface 全部可选字段，发现仍有 3 个字段未校验类型/格式：

| 字段 | TypeScript 类型 | R28 前校验 | 误写后果 |
|------|----------------|-----------|---------|
| url? | string | 仅校验与 repo 重复 | `url: my-project.dev`（无协议）→ `<a href="my-project.dev">` 被浏览器当相对路径 → 用户点击 404 |
| license? | string | SPDX 校验隐式假设字符串 | `license: [MIT]`（数组）→ `String(...).toLowerCase()` 转换误判 |
| language? | string | 完全未校验 | `language: [Rust, Python]`（数组）→ `<span>{language}</span>` 渲染为 "Rust,Python" |

R27 之所以是 CRITICAL（tags 误写破坏构建），R28 的 3 个字段误写不会破坏构建，但会导致**渲染异常或用户路径错误**——仍属真实 gap，优先级中。

## 抓到的 bug

### N1 url 字段格式未校验（用户路径错误）

**证据**：
- `src/components/ProjectCard.astro` 第 27 行：`<a class="url-link" href={project.url}>官网 ↗</a>`
- `src/pages/project/[slug].astro` 第 77 行：`<a href={project.url} target="_blank" rel="noopener noreferrer">{project.url} ↗</a>`
- CONTRIBUTING.md 示例：`url: https://my-project.dev   # 官网`

**风险场景**：贡献者误写 `url: my-project.dev`（无协议）：
- `<a href="my-project.dev">` 被浏览器当作相对路径
- 用户点击"官网"链接 → 跳转到 `/Vegavellum/my-project.dev` → 404
- 用户体验严重受损，且无校验拦截

### N2 license 字段类型未校验（SPDX 校验误判）

**证据**：
- validator 第 207 行：`String(p.license).toLowerCase()` —— 隐式假设字符串
- 如果 license 是数组 `[MIT, Apache-2.0]`，`String(...)` 转为 "MIT,Apache-2.0"
- `spdxLowercaseMap.get("mit,apache-2.0")` → undefined
- 进入 warn 分支：`warn(...)` —— 不报错，只警告
- 实际渲染：`<span class="badge">{project.license}</span>` → 渲染为 "MIT,Apache-2.0"

### N3 language 字段类型未校验（渲染异常）

**证据**：
- `src/components/ProjectCard.astro` 第 36 行：`<span class="badge lang">{project.language}</span>`
- 如果 language 是数组 `[Rust, Python]`，`<span>{language}</span>` 渲染为 "Rust,Python"
- 不会破坏构建，但渲染异常

## 修复方案

在 `scripts/validate-data.mjs` 中补全 3 个字段的类型/格式校验：

```javascript
// url 格式校验（Project interface 契约：url?: string，CONTRIBUTING 示例带 https://）
// 贡献者误写 `url: my-project.dev`（无协议）会被浏览器当相对路径，用户点击 404
if (p.url !== undefined && p.url !== '') {
  if (typeof p.url !== 'string') {
    fail(`${label}: url 必须是字符串，当前类型为 ${typeof p.url}`);
  } else {
    try {
      new URL(p.url);
    } catch {
      fail(`${label}: url "${p.url}" 不是合法 URL（应带协议，如 https://example.com）`);
    }
  }
}

// license 字段类型校验（Project interface 契约：license?: string）
// SPDX canonical 校验隐式假设字符串，若误写为数组会被 String() 转换误判
if (p.license !== undefined && p.license !== '') {
  if (typeof p.license !== 'string') {
    fail(`${label}: license 必须是字符串，当前类型为 ${typeof p.license}`);
  }
}

// language 字段类型校验（Project interface 契约：language?: string）
// 若误写为数组，<span>{language}</span> 会渲染为 "Rust,Python"
if (p.language !== undefined && p.language !== '') {
  if (typeof p.language !== 'string') {
    fail(`${label}: language 必须是字符串，当前类型为 ${typeof p.language}`);
  }
}
```

同步更新文件头注释。

**关于 license 类型校验与 SPDX 校验的顺序**：license 类型校验在 SPDX 校验之前执行。若 license 不是字符串，类型校验 fail，但 SPDX 校验仍会执行（对非字符串执行 `String(...).toLowerCase()`），可能产生冗余 warn。这是已知行为，不修复——因为 license 类型校验已 fail，validator 最终会 exit 1，冗余 warn 无害。

## MVP 回归

### 正向验证（现有数据）
```
✓ npm run validate（0 错误 0 警告）
✓ npm run build（16 页面构建完成）
```

### 负向验证（临时测试文件）

创建 `data/projects/negative-test-r28.yaml`，故意包含 3 个错误：

```yaml
url: my-project.dev           # 无协议
license: [MIT, Apache-2.0]     # 数组而非字符串
language: [Rust, Python]       # 数组而非字符串
```

运行 `npm run validate`：

```
▸ 项目数据
  ✗ negative-test-r28.yaml: url "my-project.dev" 不是合法 URL（应带协议，如 https://example.com）
  ✗ negative-test-r28.yaml: license 必须是字符串，当前类型为 object
  ✗ negative-test-r28.yaml: language 必须是字符串，当前类型为 object
  ⚠ negative-test-r28.yaml: license "MIT,Apache-2.0" 不在常见 SPDX 列表中，请到 https://spdx.org/licenses/ 核对 canonical 形式
  ⚠ negative-test-r28.yaml: status=pending，该项目不会在站点上显示，等待维护者审核

────────────────────────
  错误：3
  警告：2
────────────────────────

✗ 数据校验失败，请修复上述错误。
exit=1
```

**结论**：3 个错误全部正确拦截，exit 1。license 数组触发的额外 SPDX warn 是冗余但无害的（license 类型校验已 fail）。删除临时文件后重新 validate 通过。

## 审计反思

R28 是 R27 的自然延伸——R27 修复了 tags 字段类型校验后，水平审计发现 Project interface 还有 3 个可选字段未校验类型/格式。这验证了"同型字段不一致处理"模式的扩展：

- R27：sources 已校验 `Array.isArray`，tags 未校验（同型字段不一致）
- R28：url/license/language 未校验类型（与 tags/sources 同型，但处理不一致）

**扩展教训**：每声明一条 TypeScript interface 契约（`field?: T`），必须同步加 validator 校验。不仅是数组和枚举字段，字符串字段的类型和格式（如 url 必须是合法 URL）也应校验。

至此，Project interface 全部 12 个字段的类型/格式校验已完整覆盖：

| 字段 | 类型 | 校验 |
|------|------|------|
| name | string | 必填 ✓ |
| slug | string | 必填 + URL-friendly ✓ |
| repo | string | 必填 + owner/repo 格式 ✓ |
| description | string | 必填 ✓ |
| category | string | 必填 + 引用校验 ✓ |
| addedAt | string | 必填 + YYYY-MM-DD 格式 ✓ |
| status | enum | 必填 + 枚举 ✓ |
| url? | string | 类型 ✓ + 合法 URL 格式 ✓（R28） |
| license? | string | 类型 ✓（R28）+ SPDX canonical ✓ |
| tags? | string[] | Array.isArray ✓ + 元素 string ✓（R27） |
| language? | string | 类型 ✓（R28） |
| sources? | string[] | Array.isArray ✓ + 枚举 ✓ |
