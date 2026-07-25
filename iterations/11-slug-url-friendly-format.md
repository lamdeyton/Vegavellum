# R11 — slug / category id URL-friendly 格式校验

> 超长程任务模式第十一轮。修复 R10 后继续审计发现的 slug 格式校验缺口。

## 触发原因

R10 完成后执行 reverse reconciliation audit，检查"声明但未强制的契约"。CONTRIBUTING 第 16 行声明 `slug: my-project # URL 友好的唯一标识（必须与文件名一致）`，但 validator 只校验 slug 与文件名一致（B4）和 slug 唯一性，未校验 slug 是否真的"URL 友好"。

一个贡献者写 `slug: My Project!` 并以 `My Project!.yaml` 为文件名，能通过 B4 校验（slug 与文件名一致），但生成的 URL `/project/My Project!` 会编码为 `/project/My%20Project%21`，破坏可读性和 SEO。

## 审计发现

### N1（Horizontal · validator）：slug 和 category id 未校验 URL-friendly 格式

**症状**：
- `slug` 字段：validator 校验了唯一性和文件名一致性，但未校验格式
- `category id`：validator 校验了唯一性和必填，但未校验格式
- 两者都用于 URL 路径（`/project/<slug>` 和 `/category/<id>`），非法字符会破坏 URL

**URL-friendly 格式定义**：
- 仅小写字母 `[a-z]`、数字 `[0-9]`、连字符 `[-]`
- 必须以字母或数字开头和结尾（无首尾连字符）
- 无连续连字符
- 正则：`^[a-z0-9]+(-[a-z0-9]+)*$`

**修复**：
```javascript
// scripts/validate-data.mjs
const urlFriendlyRe = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// 分类 id 校验（用于 /category/<id> 路由）
if (c.id && !urlFriendlyRe.test(c.id)) {
  fail(`分类 id "${c.id}" 不是 URL-friendly 格式（仅小写字母/数字/连字符，无首尾/连续连字符）`);
}

// 项目 slug 校验（用于 /project/<slug> 路由）
if (p.slug && !urlFriendlyRe.test(p.slug)) {
  fail(`${label}: slug "${p.slug}" 不是 URL-friendly 格式（仅小写字母/数字/连字符，无首尾/连续连字符）`);
}
```

## 负向测试验证

### 场景 1：大写 slug（`Bad-Upper`）→ 应 fail
```
✗ Bad-Upper.yaml: slug "Bad-Upper" 不是 URL-friendly 格式（仅小写字母/数字/连字符，无首尾/连续连字符）
错误：1
✗ 数据校验失败
```
✓ 正确拦截大写字符。

### 场景 2：含空格 slug（`space test`）→ 应 fail
```
✗ space test.yaml: slug "space test" 不是 URL-friendly 格式（仅小写字母/数字/连字符，无首尾/连续连字符）
错误：1
✗ 数据校验失败
```
✓ 正确拦截空格字符。

### 场景 3：现有数据（nextjs / astro / deno / ripgrep / langchain）→ 应 pass
```
错误：0
警告：0
✓ 数据校验通过。
```
✓ 现有 5 个 slug 均为合法 URL-friendly 格式，无回归。

## MVP 回归验证

```bash
ASTRO_TELEMETRY_DISABLED=1 npm run validate
# ✓ 数据校验通过（0 错误 0 警告）

ASTRO_TELEMETRY_DISABLED=1 npm run build
# ✓ 16 page(s) built in 468ms
```

无回归。

## 子目标深度演进

R11 后，6 子目标状态：
1. **数据完整性** — 深+（slug/category id 格式校验补全，PK 字段格式契约执行）
2. **路由正确性** — 深+（URL 路径组成元素格式保证，杜绝 URL 编码破坏）
3. **可访问性** — 中+
4. **SEO/元数据** — 深+
5. **部署链路** — 深+
6. **可扩展性** — 深

## 模式总结：PK 字段格式校验

R11 是 reverse reconciliation audit 的第四次发现，模式从"声明未执行的契约"扩展到"PK 字段格式未校验"：

| 轮次 | 字段 | 类型 | 缺口 |
|------|------|------|------|
| R6 | url | 字段间约束 | url===repoUrl 未拦截 |
| R8 | sources | 枚举 | 枚举值未校验 |
| R9 | license | 格式 | SPDX canonical 未校验 |
| R11 | slug / category id | PK 格式 | URL-friendly 未校验 |

**教训**：PK 字段（用于 URL、文件名、唯一标识）必须校验格式，否则会破坏路由、SEO、文件系统操作。

## 下一轮候选（R12 审计输入）

R11 完成后剩余候选（边际递减）：
- **`astro check` 未纳入 CI**：TypeScript 诊断未运行。项目用 strict tsconfig 但无类型检查步骤。
- **README 项目结构未包含 .nvmrc**：R10 新增文件未反映在 README 结构图。
- **种子数据覆盖**：5 个分类无项目，属内容运营范畴。
