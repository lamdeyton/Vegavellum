# R32：license SPDX / url 冗余校验防御性 typeof（R31 遗漏补全）

> 类型：validator 健壮性（R31 模式扩展，CRITICAL + MINOR）
> 触发：R31 后水平审计发现 R31 添加了 7 处防御性 typeof，但遗漏了 2 处后续校验
> 子目标影响：1. 数据完整性（CRITICAL：矛盾错误信息）+ validator 健壮性 checklist 补全

## 背景

R31 确立了 **validator 健壮性模式**："新增 validator 校验时，如果校验假设字段是某类型，必须在前面加 typeof 防御，避免类型错误字段导致崩溃或误导性错误。" R31 给 7 处后续校验（addedAt 格式、slug vs 文件名、slug URL-friendly、slug 唯一、category 引用、status 枚举、repo 格式）加了防御性 typeof。

R31 完成后三类审计中，重新通读 validator 全文，**寻找"假设字符串但未加 typeof 防御"的剩余校验**。水平审计发现 2 处遗漏：

1. **CRITICAL**：license SPDX canonical 校验（第 242 行）
2. **MINOR**：url 冗余校验（第 178 行）

## 抓到的 bug

### N1（CRITICAL）license SPDX 校验输出矛盾错误信息

**问题代码（R32 前）**：

```javascript
// 第 198 行：类型校验（R28 加的）
if (p.license !== undefined && p.license !== '') {
  if (typeof p.license !== 'string') {
    fail(`${label}: license 必须是字符串，当前类型为 ${typeof p.license}`);
  }
}

// 第 242 行：SPDX canonical 校验（R9 加的，假设字符串）
if (p.license !== undefined && p.license !== '') {
  const canonical = spdxLowercaseMap.get(String(p.license).toLowerCase());
  if (canonical && canonical !== p.license) {
    fail(`${label}: license "${p.license}" 不是 canonical SPDX 形式，应为 "${canonical}"`);
  } else if (!canonical) {
    warn(`${label}: license "${p.license}" 不在常见 SPDX 列表中...`);
  }
}
```

**矛盾路径**：当 `license: [MIT]`（数组）时

1. 第 198 行 `typeof p.license !== 'string'` → true → `fail("license 必须是字符串，当前类型为 object")` ✓ 正确报错
2. **但 fail() 不退出**，继续执行第 242 行
3. `String(['MIT']).toLowerCase()` → `"mit"`
4. `spdxLowercaseMap.get("mit")` → `"MIT"`（命中 canonical）
5. `canonical !== p.license`：`"MIT" !== ['MIT']` → **true**（string !== array，恒为 true）
6. `fail(\`${label}: license "${p.license}" 不是 canonical SPDX 形式，应为 "${canonical}"\`)`
   - `${['MIT']}` → `"MIT"`（Array.toString()）
   - `${canonical}` → `"MIT"`
   - **输出**：`license "MIT" 不是 canonical SPDX 形式，应为 "MIT"`

贡献者看到 **"MIT 不是 canonical，应为 MIT"** 这种自相矛盾的错误信息，无法理解实际原因（类型错误）。R28 已经在第一步报了正确的类型错误，但 R31 模式要求"后续校验也加防御性 typeof"以避免这种矛盾错误信息叠加。

**负向测试证据**：

创建临时 `data/projects/_r32-test-array-license.yaml`：

```yaml
name: TestArrayLicense
slug: test-array-license
repo: [owner/repo]
description: testing license array
category: cli
url: https://github.com/owner/repo
license: [MIT]
addedAt: 2026-07-24
status: published
sources: [curator-curated]
```

**修复前预期输出**（基于代码追踪）：
- `repo 必须是字符串，当前类型为 object` ✓（R31 类型校验）
- `slug 与文件名不一致` ✓
- `license 必须是字符串，当前类型为 object` ✓（R28 类型校验）
- **`license "MIT" 不是 canonical SPDX 形式，应为 "MIT"`** ✗（矛盾错误信息，R32 修复目标）
- **`⚠ url "https://github.com/owner/repo" 与 repo URL 重复`** ✗（误导性 warn，因为 p.url 是字符串、p.repo 是数组，模板字面量将数组 stringify 为 "owner/repo"，字符串相等比较误命中，R32 修复目标）

**修复后实际输出**：
```
▸ 项目数据
  ✗ _r32-test-array-license.yaml: repo 必须是字符串，当前类型为 object
  ✗ _r32-test-array-license.yaml: slug "test-array-license" 与文件名 "_r32-test-array-license" 不一致（B4 契约：文件名即 slug）
  ✗ _r32-test-array-license.yaml: license 必须是字符串，当前类型为 object

────────────────────────
  错误：3
  警告：0
────────────────────────
```

✓ 矛盾的 "MIT 不是 canonical 应为 MIT" 消失
✓ 误导性 url 冗余 warn 消失
✓ 3 个真实错误准确报告

### N2（MINOR）url 冗余校验输出误导性 warn

**问题代码（R32 前）**：

```javascript
// 第 178 行：url 冗余校验（R6 加的，假设 url 和 repo 都是字符串）
if (p.url && p.repo && p.url === `https://github.com/${p.repo}`) {
  warn(`${label}: url "${p.url}" 与 repo URL 重复，无独立官网时应省略 url 字段`);
}
```

**误导路径**：当 `url: "https://github.com/owner/repo"`（字符串）且 `repo: ['owner/repo']`（数组）时

1. `p.url` truthy ✓
2. `p.repo` truthy ✓（数组是 truthy）
3. `\`https://github.com/${['owner/repo']}\`` → `"https://github.com/owner/repo"`（模板字面量将数组 stringify）
4. `p.url === "https://github.com/owner/repo"` → **true**
5. `warn("url 与 repo URL 重复")` ← **误导性 warn**

贡献者已通过 R31 类型校验知道 repo 是数组，但额外看到一个 "url 与 repo URL 重复" 的 warn，会误以为还需要修复 url 字段。

## 修复方案

### 修复 1：license SPDX 校验加防御性 typeof

```javascript
// 修复后（R32）
if (typeof p.license === 'string' && p.license !== '') {
  const canonical = spdxLowercaseMap.get(p.license.toLowerCase());  // 移除 String() 包装
  if (canonical && canonical !== p.license) {
    fail(`${label}: license "${p.license}" 不是 canonical SPDX 形式，应为 "${canonical}"`);
  } else if (!canonical) {
    warn(`${label}: license "${p.license}" 不在常见 SPDX 列表中...`);
  }
}
```

变化：
- 条件改为 `typeof p.license === 'string' && p.license !== ''`（防御性 typeof）
- 移除 `String()` 包装（已通过 typeof 保证是字符串，无需再 stringify）

### 修复 2：url 冗余校验加防御性 typeof

```javascript
// 修复后（R32）
if (typeof p.url === 'string' && typeof p.repo === 'string' && p.url && p.repo && p.url === `https://github.com/${p.repo}`) {
  warn(`${label}: url "${p.url}" 与 repo URL 重复，无独立官网时应省略 url 字段`);
}
```

变化：条件前加 `typeof p.url === 'string' && typeof p.repo === 'string'`，确保两个都是字符串才执行相等比较。

## MVP 回归

### 正向验证（现有数据）

```
✓ npm run validate（0 错误 0 警告）
✓ npm run build（16 页面构建完成，69ms）
```

### 负向验证 1：license 数组 + repo 数组 + url 是 github URL

创建临时 `_r32-test-array-license.yaml`（同上），运行 `npm run validate`：

```
▸ 项目数据
  ✗ _r32-test-array-license.yaml: repo 必须是字符串，当前类型为 object
  ✗ _r32-test-array-license.yaml: slug "test-array-license" 与文件名 "_r32-test-array-license" 不一致
  ✗ _r32-test-array-license.yaml: license 必须是字符串，当前类型为 object

────────────────────────
  错误：3
  警告：0
────────────────────────
```

✓ 无矛盾 "MIT 不是 canonical 应为 MIT" 错误
✓ 无误导性 "url 与 repo URL 重复" warn
✓ 3 个真实错误准确报告

### 负向验证 2：url 冗余 warn 正向回归

创建临时 `_r32-test-url-redundant.yaml`，让 url 和 repo 都是合法字符串且 url 与 github URL 完全重复：

```yaml
url: https://github.com/owner/repo
repo: owner/repo
```

运行 `npm run validate`：

```
▸ 项目数据
  ✗ _r32-test-url-redundant.yaml: slug 与文件名不一致
  ⚠ _r32-test-url-redundant.yaml: url "https://github.com/owner/repo" 与 repo URL 重复，无独立官网时应省略 url 字段
  ⚠ _r32-test-url-redundant.yaml: status=pending，该项目不会在站点上显示，等待维护者审核
```

✓ url 冗余 warn 在两个都是字符串时仍然正常触发（R6 行为未破坏）

恢复数据后 `npm run validate` 通过（0 错误 0 警告）。

## 审计反思

R32 是 R31 模式的直接补全。R31 确立了 **validator 健壮性 checklist 项**："新增 validator 校验时，如果校验假设字段是某类型，必须在前面加 typeof 防御"，并给 7 处后续校验加了防御性 typeof。

**但 R31 漏了 2 处**：

| # | 后续校验 | 添加轮次 | R31 是否覆盖 | R32 修复 |
|---|---------|---------|------------|---------|
| 1 | addedAt 格式 | R5 | ✓ | — |
| 2 | slug vs 文件名 | R1 (B4) | ✓ | — |
| 3 | slug URL-friendly | R11 | ✓ | — |
| 4 | slug 唯一 | R11 | ✓ | — |
| 5 | category 引用 | R1 (B3) | ✓ | — |
| 6 | status 枚举 | R1 | ✓ | — |
| 7 | repo 格式 | R1 | ✓ | — |
| 8 | **url 冗余 warn** | R6 | ✗ | ✓ R32 |
| 9 | url 类型/格式 | R28 | ✓（已用 if/else 互斥） | — |
| 10 | license 类型 | R28 | ✓（已用 if/else 互斥） | — |
| 11 | **license SPDX canonical** | R9 | ✗ | ✓ R32 |
| 12 | language 类型 | R28 | ✓（仅类型校验，无后续） | — |

**为什么 R31 漏了这 2 处？**

- **license SPDX**：R9 比 R28 早，R28 加 license 类型校验时只用了 `if (typeof !== 'string') fail()` 但没改 R9 的后续 SPDX 校验。R31 检查时关注的是"必填字段的后续校验"（7 个），把"可选字段的后续校验"留给了 R28 的 if/else 互斥结构处理——但 R9 的 SPDX 校验是独立 if，不在 R28 的 if/else 内部，所以被遗漏。
- **url 冗余 warn**：R6 比 R28 早，且是 warn 而非 fail。R31 关注点在"必填字段后续校验"，url/repo 都不是必填字段的后续校验，所以遗漏。

**教训（R31 模式扩展）**：

R31 确立的 checklist 项应进一步细化为：

1. **必填字段后续校验**：必填字段类型校验后的所有引用该字段的校验（R31 覆盖）
2. **可选字段独立后续校验**：可选字段类型校验后，如果有**独立 if**（非 if/else 互斥）的后续校验，也必须加 typeof 防御（R32 补全）
3. **跨字段校验**：涉及多个字段的校验（如 url 冗余同时用 url 和 repo），每个字段都必须加 typeof 防御（R32 补全）

**审计方法补充**：

R31 后审计应执行的检查："通读 validator 全文，列出所有 if (p.x ...) 形式的校验，检查每个是否假设字段是字符串/数组，是否在前面加了 typeof 防御。" R31 只执行了"必填字段后续校验"子集，R32 补全到全量。

至此，validator 中所有假设字段类型的校验都有 typeof 防御，**validator 健壮性 checklist 完整闭环**。
