# R31：Project 必填字段类型校验 + 防御性 typeof

> 类型：声明但未执行的契约（同 R27/R28/R29 模式，CRITICAL）+ validator 健壮性
> 触发：R30 后水平审计发现 Project 必填字段未校验 typeof，负向测试发现 repo 数组导致 validator 崩溃
> 子目标影响：1. 数据完整性（CRITICAL）

## 背景

R29 完成 Category interface 5 字段类型校验后，R30 同步了 README。水平审计扩展到 Project interface 的**必填字段**（name/slug/repo/description/category/addedAt/status）。

发现：R28 只给**可选字段**（url/license/language）加了 typeof 校验，**必填字段**只校验了存在性（`undefined/null/''`），未校验 typeof。

```javascript
// R31 前的必填字段校验（validator 第 110-115 行）
for (const f of requiredFields) {
  if (p[f] === undefined || p[f] === null || p[f] === '') {
    fail(`${label}: 缺少必填字段 ${f}`);
  }
}
```

`name: [Next, js]`（数组）不是 undefined/null/''，通过必填校验，进入渲染层导致异常。更严重的是 `repo: [vercel, next.js]`（数组）通过必填校验后，`p.repo.split('/')` 因数组没有 split 方法而 **TypeError 崩溃**，validator 进程异常退出，贡献者看到栈追踪而非友好错误信息。

## 抓到的 bug

### N1（CRITICAL）Project 7 个必填字段未校验 typeof

**负向测试证据**：

修改 `data/projects/nextjs.yaml`：
```yaml
name: [Next, js]              # 数组而非字符串
slug: nextjs
repo: [vercel, next.js]        # 数组而非字符串
description: [The, React, Framework]  # 数组而非字符串
```

运行 `node scripts/validate-data.mjs`：

**name 数组（修复前）**：
```
▸ 项目数据
────────────────────────
  错误：0
  警告：0
────────────────────────
✓ 数据校验通过。
```
name 数组**通过校验**（0 错误），渲染时 `<h1>{project.name}</h1>` 渲染为 "Next,js"。

**repo 数组（修复前）**：
```
▸ 项目数据
file:///.../scripts/validate-data.mjs:149
  if (p.repo && (p.repo.split('/').length !== 2 || p.repo.includes('://'))) {
                        ^

TypeError: p.repo.split is not a function
    at file:///.../scripts/validate-data.mjs:149:25
    ...
Node.js v26.3.0
```
repo 数组导致 validator **崩溃**（TypeError），而非友好 fail。

**字段对照**：

| 必填字段 | TypeScript 类型 | R31 前校验 | 数组误写后果 |
|---------|----------------|-----------|-------------|
| name | string | 仅存在性 | 通过校验 → 渲染 "Next,js" |
| slug | string | 存在性 + 格式 + 唯一 | urlFriendlyRe.test() 会 String() 转换，可能误判 |
| repo | string | 存在性 + 格式 | **p.repo.split() TypeError 崩溃**（CRITICAL） |
| description | string | 仅存在性 | 通过校验 → 渲染 "The,React,Framework" |
| category | string | 存在性 + 引用 | Set.has(数组)=false → 误报"category 不存在" |
| addedAt | string | 存在性 + 格式 | 正则 .test() 会 String() 转换，可能误判 |
| status | enum | 存在性 + 枚举 | Set.has(数组)=false → 误报"status 不在枚举内" |

### N2 fail() 不退出导致后续校验崩溃或误导

R31 类型校验用 `fail()` 记录错误，但 `fail()` 只增加 errorCount，不退出。validator 继续执行后续校验，对类型错误的字段执行假设字符串的操作，导致：
- **崩溃**：repo 格式校验 `p.repo.split('/')` → TypeError
- **误导性错误**：category 引用校验 `Set.has(数组)` → false → 误报"category 不存在于 categories.yaml"
- **误导性错误**：status 枚举校验 `Set.has(数组)` → false → 误报"status 不在枚举内"
- **误导性错误**：slug vs 文件名 `数组 !== 字符串` → true → 误报"slug 与文件名不一致"

贡献者看到 "category 不存在" + "status 不在枚举内" + "slug 不一致" 等误导性错误，实际根本原因是字段类型错误。

## 修复方案

### 修复 1：添加 Project 必填字段类型校验

在 `scripts/validate-data.mjs` 必填字段校验之后、其他校验之前，添加 7 个必填字段的 typeof 校验：

```javascript
// Project interface 必填字段类型校验（R31）
const projectRequiredStringFields = ['name', 'slug', 'repo', 'description', 'category', 'addedAt', 'status'];
for (const f of projectRequiredStringFields) {
  if (p[f] !== undefined && p[f] !== null && p[f] !== '' && typeof p[f] !== 'string') {
    fail(`${label}: ${f} 必须是字符串，当前类型为 ${typeof p[f]}`);
  }
}
```

### 修复 2：后续校验加防御性 typeof 检查

在所有假设字段是字符串的后续校验前加 `typeof p.x === 'string'` 防御，避免：
- 崩溃：repo 格式校验 `p.repo.split('/')`
- 误导性错误：category 引用 / status 枚举 / slug vs 文件名 / slug URL-friendly / addedAt 格式

```javascript
// 示例：repo 格式校验（CRITICAL 防御）
if (typeof p.repo === 'string' && p.repo && (p.repo.split('/').length !== 2 || p.repo.includes('://'))) {
  fail(`${label}: repo "${p.repo}" 应为 owner/repo 格式`);
}

// 示例：category 引用校验（避免误导性错误）
if (typeof p.category === 'string' && p.category && !categoryIds.has(p.category)) {
  fail(`${label}: category "${p.category}" 不存在于 categories.yaml（B3 引用断裂）`);
}
```

共修改 7 处后续校验：addedAt 格式、slug vs 文件名、slug URL-friendly、slug 唯一、category 引用、status 枚举、repo 格式。

同步更新文件头注释，新增"Project 必填字段类型"说明。

## MVP 回归

### 正向验证（现有数据）
```
✓ npm run validate（0 错误 0 警告）
✓ npm run build（16 页面构建完成）
```

### 负向验证（临时修改 nextjs.yaml）

将 `name`/`repo`/`description` 改为数组：

```yaml
name: [Next, js]
repo: [vercel, next.js]
description: [The, React, Framework]
```

运行 `node scripts/validate-data.mjs`：

**修复前**：
- name 数组 → 0 错误（通过校验，渲染异常）
- repo 数组 → TypeError 崩溃

**修复后**：
```
▸ 项目数据
  ✗ nextjs.yaml: name 必须是字符串，当前类型为 object
  ✗ nextjs.yaml: repo 必须是字符串，当前类型为 object
  ✗ nextjs.yaml: description 必须是字符串，当前类型为 object

────────────────────────
  错误：3
  警告：0
────────────────────────

✗ 数据校验失败，请修复上述错误。
```

**结论**：
- 3 个类型错误被正确报告 ✓
- 不再崩溃 ✓
- 无误导性错误信息（不再报"category 不存在"等）✓
- exit 1 ✓

恢复 nextjs.yaml 后重新 validate 通过（0 错误 0 警告）。

## 审计反思

R31 是 R27/R28/R29 模式的自然延伸——但发现了更深层的 gap：

**R27-R29 只校验了可选字段和 Category 字段的类型，遗漏了 Project 必填字段**。原因是 R27 从 tags（可选字段）开始，R28 扩展到 url/license/language（可选字段），R29 扩展到 Category（另一个 interface）。必填字段一直被"存在性校验"掩盖，以为有了存在性校验就够了。

**教训**：存在性校验（`!== undefined/null/''`）不能替代类型校验（`typeof === 'string'`）。数组/对象是非空值，通过存在性校验，但不是字符串。

**R31 的第二个发现（fail() 不退出导致崩溃）是 validator 健壮性问题**：`fail()` 设计为"记录错误但继续执行"，以便报告所有错误。但对类型错误的字段，后续校验假设字符串，会导致崩溃或误导性错误。修复方式是在后续校验前加防御性 typeof 检查，而非改为"fail 后退出"（那会遗漏其他字段的错误）。

**扩展教训**：未来新增 validator 校验时，如果新校验假设字段是某类型，必须在前面加 typeof 防御，避免类型错误字段导致崩溃。这是 validator 健壮性的 checklist 项。

至此，Project interface 全部 12 字段 + Category interface 全部 5 字段的类型校验已完整覆盖，且后续校验都有防御性 typeof 检查，validator 不会因类型错误而崩溃。
