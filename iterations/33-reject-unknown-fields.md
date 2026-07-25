# R33：validator 拒绝未知字段（Project + Category 封闭契约执行）

> 类型：声明但未执行的契约（同 R6/R8/R9/R11/R27/R28/R29/R31 模式扩展，CRITICAL）
> 触发：R32 后水平审计发现 Project/Category interface 是封闭契约但 validator 不拒绝未知字段
> 子目标影响：1. 数据完整性（CRITICAL：可选字段 typo 静默通过）+ 6. 可扩展性（封闭契约执行）

## 背景

R32 完成 validator 健壮性 checklist 闭环后，R32 后三类审计继续寻找"声明但未执行的契约"。

水平审计发现：**Project interface 和 Category interface 都是封闭契约**（固定字段集合），但 validator 只校验"必填字段存在"和"已知字段类型/格式正确"，**不拒绝未知字段**。

```typescript
// src/lib/data.ts
export interface Project {
  name: string;
  slug: string;
  repo: string;
  description: string;
  category: string;
  url?: string;
  license?: string;
  tags?: string[];
  language?: string;
  addedAt: string;
  status: 'published' | 'pending' | 'rejected';
  sources?: string[];
}
```

TypeScript interface 是封闭契约——编译时类型检查会拒绝 `project.lisense`（typo）。但 YAML 解析无类型保护，validator 是唯一防线。R31 模式说"TypeScript interface 是编译时契约，运行时 YAML 解析无类型保护，validator 是唯一防线"——但 R31 只覆盖了**类型校验**，没覆盖**字段集合校验**。

## 抓到的 bug

### N1（CRITICAL）可选字段 typo 静默通过

**问题代码（R33 前）**：validator 只校验已知字段，不检查 `Object.keys(p)` 是否有未知字段。

**负向测试证据**：

创建临时 `data/projects/_r33-test-typo.yaml`，含 4 个 typo 字段：

```yaml
name: TestTypoFields
slug: test-typo-fields
repo: owner/repo
description: testing typo in optional fields
category: cli
url: https://example.com
lisense: MIT              # typo：应为 license
tagz: [a, b, c]           # typo：应为 tags
lang: Rust                # typo：应为 language
addedAt: 2026-07-24
status: pending
source: [community-nominated]  # typo：应为 sources
```

**修复前**（基于代码追踪，R33 前无未知字段校验）：
- validator 只报 `slug 与文件名不一致`（B4 契约）+ `status=pending` warn
- 4 个 typo 字段静默通过：`lisense` / `tagz` / `lang` / `source` 全部被 YAML 解析为对象属性，但被 validator 和渲染层忽略
- ProjectCard 渲染时：无 license badge、无 tags 列表、无 language badge、无 sources 标签
- **贡献者以为自己添加了这些字段，但实际全部丢失，且无任何错误提示**

**为什么必填字段 typo 不会被捕获**：
- 如贡献者写 `naem: Foo`（typo）而非 `name: Foo`
- `name` 字段缺失 → validator 报"缺少必填字段 name"
- 贡献者看到错误，检查后发现 typo
- 所以必填字段 typo **间接被捕获**（通过"缺少必填字段"）

**为什么可选字段 typo 不会被捕获**：
- 如贡献者写 `lisense: MIT`（typo）而非 `license: MIT`
- `license` 字段缺失 → validator 不报错（license 是可选字段，缺失合法）
- `lisense` 字段存在 → validator 不报错（不检查未知字段）
- 贡献者看到 0 错误，以为提交正确
- ProjectCard 渲染时 `<span class="badge license">{project.license}</span>` → license 是 undefined → 条件 `{project.license && ...}` false → 不渲染 badge
- **贡献者永远不知道自己的 license 字段 typo 了**

**4 个可选字段 typo 后果对照**：

| typo 字段 | 正确字段 | 渲染后果 |
|----------|---------|---------|
| `lisense` | `license` | 无 license badge |
| `tagz` | `tags` | 无 tags 列表 |
| `lang` | `language` | 无 language badge |
| `source` | `sources` | 无 sources 标签 |

## 修复方案

### 修复 1：定义已知字段集合

在 validator 顶部定义 Project interface 12 个已知字段和 Category interface 5 个已知字段的 Set：

```javascript
// Category interface 已知字段集合（与 catStringFields 同源，用 Set 以 O(1) 查找）
const knownCategoryFields = new Set(catStringFields);

// Project interface 已知字段集合（12 个字段：7 必填 + 5 可选）
const knownProjectFields = new Set([
  ...requiredFields,        // 7 必填
  'url', 'license', 'tags', 'language', 'sources',  // 5 可选
]);
```

### 修复 2：在 categories 循环中加未知字段校验

```javascript
for (const c of categories) {
  // ...existing checks...

  // 未知字段校验（R33：Category interface 是封闭契约，拒绝 typo 字段）
  if (c && typeof c === 'object') {
    for (const k of Object.keys(c)) {
      if (!knownCategoryFields.has(k)) {
        fail(`分类 ${c.id || JSON.stringify(c)}: 未知字段 "${k}"，请检查拼写（已知字段：${[...knownCategoryFields].join('/')})`);
      }
    }
  }
}
```

### 修复 3：在 projects 循环中加未知字段校验

```javascript
for (const { file, data: p } of projects) {
  // 必填字段
  for (const f of requiredFields) { ... }

  // 未知字段校验（R33：Project interface 是封闭契约，拒绝 typo 字段）
  if (p && typeof p === 'object') {
    for (const k of Object.keys(p)) {
      if (!knownProjectFields.has(k)) {
        fail(`${label}: 未知字段 "${k}"，请检查拼写（已知字段：${[...knownProjectFields].join('/')})`);
      }
    }
  }

  // ...其他校验...
}
```

### 修复 4：同步文件头注释和 README

- validator 头注释新增"未知字段：Project/Category YAML 不得含已知字段以外的字段（防 typo 静默通过，如 lisense/tagz/lang/source）"
- README "数据校验" 描述末尾新增"未知字段拒绝防 typo"

## MVP 回归

### 正向验证（现有数据）

```
✓ npm run validate（0 错误 0 警告）
✓ npm run build（16 页面构建完成，474ms）
```

### 负向验证（临时 typo YAML）

创建临时 `_r33-test-typo.yaml`，含 4 个 typo 字段（`lisense` / `tagz` / `lang` / `source`）：

```
▸ 项目数据
  ✗ _r33-test-typo.yaml: 未知字段 "lisense"，请检查拼写（已知字段：name/slug/repo/description/category/addedAt/status/url/license/tags/language/sources)
  ✗ _r33-test-typo.yaml: 未知字段 "tagz"，请检查拼写（已知字段：name/slug/repo/description/category/addedAt/status/url/license/tags/language/sources)
  ✗ _r33-test-typo.yaml: 未知字段 "lang"，请检查拼写（已知字段：name/slug/repo/description/category/addedAt/status/url/license/tags/language/sources)
  ✗ _r33-test-typo.yaml: 未知字段 "source"，请检查拼写（已知字段：name/slug/repo/description/category/addedAt/status/url/license/tags/language/sources)
  ✗ _r33-test-typo.yaml: slug "test-typo-fields" 与文件名 "_r33-test-typo" 不一致（B4 契约：文件名即 slug）
  ⚠ _r33-test-typo.yaml: status=pending，该项目不会在站点上显示，等待维护者审核

────────────────────────
  错误：5
  警告：1
────────────────────────
```

✓ 4 个 typo 字段全部被精准识别
✓ 错误信息包含完整已知字段列表，贡献者可立即对照修正
✓ exit 1（CI 会失败，PR 被拦截）

恢复数据后 `npm run validate` 通过（0 错误 0 警告）。

## 审计反思

R33 是 R6/R8/R9/R11/R27/R28/R29/R31 **"声明但未执行的契约"模式**的自然延伸。但发现了更深层的维度：

**R27-R32 关注"字段值校验"**（值是否是字符串、是否是合法 URL、是否是 SPDX canonical），但忽略了**"字段集合校验"**（YAML 中的字段是否都属于 interface 声明的字段集合）。

**为什么 R27-R32 没发现这个 gap？**

- R27 从 tags 字段开始（值校验：是否数组）
- R28 扩展到 url/license/language（值校验：是否字符串、是否合法 URL）
- R29 扩展到 Category interface（值校验：5 字段是否字符串）
- R31 扩展到必填字段（值校验：7 必填字段是否字符串）+ 防御性 typeof
- R32 补全 R31 遗漏的 2 处防御性 typeof

每一轮都在"已有字段上加值校验"，没人问"**YAML 里会不会有 interface 之外的字段？**"

**教训（"声明但未执行的契约"模式扩展）**：

interface 契约有两层：
1. **字段值契约**：每个字段的类型/格式/枚举（R27-R32 已覆盖）
2. **字段集合契约**：YAML 中只能出现 interface 声明的字段（R33 新覆盖）

未来添加 interface 字段时，必须同步更新 `knownProjectFields` / `knownCategoryFields` Set。这成为"声明但未执行的契约"模式的新 checklist 项。

**与 R31 健壮性模式的关系**：

R31 确立的"validator 健壮性"关注的是"已知字段假设字符串时加 typeof 防御"。R33 关注的是"YAML 是否有未知字段"。两者互补：
- R31-R32：已知字段假设类型时的防御
- R33：字段集合封闭性的执行

至此，validator 契约执行覆盖三层：
1. **字段集合**（R33）：拒绝未知字段
2. **字段值类型**（R27-R32）：typeof / Array.isArray 校验
3. **字段值格式**（R5/R9/R11）：日期 / SPDX / URL-friendly 校验

三层闭环，validator 契约执行完整。
