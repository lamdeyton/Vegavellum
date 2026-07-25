# R36：可选字段空值校验 + null/非对象 YAML 防御性检查

> 类型：横向审计 gap + validator 健壮性（R31 系列扩展，CRITICAL）
> 触发：R35 后三类审计发现可选字段空值（`url: ""` / `tags: []`）静默通过 + 空 YAML 文件导致 validator 崩溃
> 子目标影响：1. 数据完整性（CRITICAL：空值与字段省略语义混淆）+ 6. 可扩展性（validator 健壮性闭环）

## 背景

R35 完成 tags/sources 数组元素级校验后，继续审计 validator 的契约执行覆盖度。横向审计发现两类未执行的契约：

### Gap 1：可选字段空值静默通过

**字段值 vs 字段省略的语义差异**：

| 写法 | 语义 | 渲染效果 |
|------|------|---------|
| `url: https://example.com` | 字段存在，有值 | 显示官网链接 |
| 省略 `url` 字段 | 字段不存在，使用默认（GitHub repo URL） | 显示 GitHub 链接 |
| `url: ""` | **字段存在但为空字符串** | 渲染 `<a href="">官网 ↗</a>`，点击无反应或跳转当前页 |

`url: ""` 与省略 `url` 渲染效果不同，但 validator 都通过。贡献者显式写空字符串是误写（意图是省略字段），但被静默接受，导致渲染异常且无错误提示。

**5 个可选字段同型 gap**：
- `url: ""` / `license: ""` / `language: ""`（字符串字段空字符串）
- `tags: []` / `sources: []`（数组字段空数组）

### Gap 2：空/非对象 YAML 文件导致 validator 崩溃（CRITICAL）

R31-R35 系列建立"防御性 typeof"模式，但都假设 `p`（YAML 解析结果）是对象。实际 YAML 可能解析为：

| YAML 内容 | 解析结果 | 后续 `p[f]` 访问 |
|----------|---------|-----------------|
| 空文件 / 仅注释 | `null` | `TypeError: Cannot read properties of null` |
| `- item1\n- item2` | 数组 | `Object.keys(p)` TypeError |
| `just-a-string` | 字符串 | `p[f]` undefined，但 `Object.keys("str")` 在严格模式报错 |

**崩溃证据**：贡献者创建空 YAML 文件后保存（如编辑器自动创建），CI 运行 validator 会抛 TypeError 而非可读的错误信息，contributor 无法定位问题。

## 抓到的 bug

### N1（CRITICAL）可选字符串字段空字符串静默通过

`url: ""` / `license: ""` / `language: ""` 通过校验 → ProjectCard 渲染空链接/空 badge/空语言。

**负向测试证据**：`url: ""` → validator 通过 → `<a href="">官网 ↗</a>` 渲染异常。

### N2（CRITICAL）可选数组字段空数组静默通过

`tags: []` / `sources: []` 通过校验 → ProjectCard 不渲染标签/来源，但与字段省略的渲染效果相同，语义混淆。

### N3（CRITICAL）空 YAML 文件导致 validator 崩溃

空文件 / 仅注释的 YAML 解析为 `null`，后续 `p[f]` 访问抛 `TypeError: Cannot read properties of null (reading 'name')`。

**负向测试证据**：`data/projects/r36test-null-file.yaml`（仅含注释） → validator 崩溃，CI 失败但错误信息不可读。

### N4（CRITICAL）非对象 YAML 顶层导致 validator 崩溃

YAML 顶层为数组（`- item1\n- item2`）或标量（`just-a-string`）时，`Object.keys(p)` 或 `p[f]` 抛 TypeError。

**负向测试证据**：
- `data/projects/r36test-array-toplevel.yaml`（YAML 数组） → `Object.keys(p)` TypeError
- `data/projects/r36test-scalar-toplevel.yaml`（YAML 标量） → `p[f]` undefined（无 TypeError 但所有字段校验误报"缺少必填字段"）

## 修复方案

### 修复 1：可选字符串字段空字符串校验

```javascript
// url 空字符串校验（license / language 同型）
if (p.url === '') {
  fail(`${label}: url 为空字符串，要么不写该字段，要么写有效 URL（如 https://example.com）`);
} else if (p.url !== undefined) {
  // 后续 typeof / URL 格式校验（R28）
  if (typeof p.url !== 'string') { ... }
  ...
}
```

**关键设计**：
- 空字符串校验在 `else if (p.url !== undefined)` 之前，确保空字符串先被拦截
- 错误信息明确告知"要么不写，要么写有效值"，引导贡献者正确处理

### 修复 2：可选数组字段空数组校验

```javascript
// tags 空数组校验（sources 同型）
if (p.tags !== undefined) {
  if (!Array.isArray(p.tags)) {
    fail(`${label}: tags 必须是数组，当前类型为 ${typeof p.tags}`);
  } else if (p.tags.length === 0) {
    fail(`${label}: tags 为空数组，要么不写该字段，要么写有效标签（如 [cli, rust]）`);
  } else {
    // 后续元素级校验（R35）
    ...
  }
}
```

**关键设计**：
- 空数组校验在 `else if`，与 `Array.isArray` 校验互斥，避免空数组误报"类型错误"
- 错误信息示例化（`[cli, rust]`），降低贡献者理解成本

### 修复 3：null/非对象 YAML 防御性检查

```javascript
// 在 projects 循环开头，所有字段校验之前
if (p === null || p === undefined) {
  fail(`${label}: 项目文件为空或仅含注释（YAML 解析为 null），请填写项目数据或删除该文件`);
  continue;
}
if (typeof p !== 'object' || Array.isArray(p)) {
  fail(`${label}: 项目文件顶层必须是对象（YAML mapping），当前类型为 ${Array.isArray(p) ? 'array' : typeof p}`);
  continue;
}
```

**关键设计**：
- `continue` 跳过后续所有校验，避免 null/非对象触发连锁 TypeError
- 错误信息区分 `null`（空文件）和非对象（数组/标量），贡献者可定位问题
- 与 R31 防御性 typeof 模式互补：R31 防御"字段类型错误"，R36 防御"整个项目对象类型错误"

### 修复 4：同步文档与注释

- validator 头注释新增"可选字段空值：url/license/language 不得为空字符串，tags/sources 不得为空数组"
- README "数据校验"描述新增"可选字段空值校验 + 空文件与非对象 YAML 防御性检查"
- CONTRIBUTING.md 可选字段部分新增空值规则注释（5 类反例）

## MVP 回归

### 正向验证（现有数据）

```
✓ npm run validate（0 错误 0 警告）
✓ npm run build（16 页面构建完成，1.35s）
```

### 负向验证（8 类违规）

创建 8 个临时测试文件，覆盖全部 4 类 bug：

| 测试文件 | 测试内容 | 预期错误 |
|---------|---------|---------|
| `r36test-empty-url.yaml` | `url: ""` | "url 为空字符串" |
| `r36test-empty-license.yaml` | `license: ""` | "license 为空字符串" |
| `r36test-empty-language.yaml` | `language: ""` | "language 为空字符串" |
| `r36test-empty-tags.yaml` | `tags: []` | "tags 为空数组" |
| `r36test-empty-sources.yaml` | `sources: []` | "sources 为空数组" |
| `r36test-null-file.yaml` | 空文件（仅注释） | "项目文件为空或仅含注释" |
| `r36test-array-toplevel.yaml` | YAML 顶层数组 | "项目文件顶层必须是对象，当前类型为 array" |
| `r36test-scalar-toplevel.yaml` | YAML 顶层标量 | "项目文件顶层必须是对象，当前类型为 string" |

**实际运行结果**：

```
▸ 项目数据
  ✗ r36test-array-toplevel.yaml: 项目文件顶层必须是对象（YAML mapping），当前类型为 array
  ✗ r36test-empty-language.yaml: language 为空字符串，要么不写该字段，要么写有效语言名（如 Rust）
  ✗ r36test-empty-license.yaml: license 为空字符串，要么不写该字段，要么写有效 SPDX 标识符（如 MIT）
  ✗ r36test-empty-sources.yaml: sources 为空数组，要么不写该字段，要么写有效来源（如 [community-nominated]）
  ✗ r36test-empty-tags.yaml: tags 为空数组，要么不写该字段，要么写有效标签（如 [cli, rust]）
  ✗ r36test-empty-url.yaml: url 为空字符串，要么不写该字段，要么写有效 URL（如 https://example.com）
  ✗ r36test-null-file.yaml: 项目文件为空或仅含注释（YAML 解析为 null），请填写项目数据或删除该文件
  ✗ r36test-scalar-toplevel.yaml: 项目文件顶层必须是对象（YAML mapping），当前类型为 string

────────────────────────
  错误：8
  警告：5
────────────────────────

✗ 数据校验失败，请修复上述错误。
```

✓ 8 类违规全部精准识别
✓ null/非对象文件未崩溃（R31 防御性 typeof 模式扩展到"整个项目对象"层级）
✓ 错误信息明确指引修复方向（"要么不写，要么写有效值"）
✓ exit 1（CI 会失败，PR 被拦截）

恢复数据后 `npm run validate` 通过（0 错误 0 警告）。

## 审计反思

R36 是 R31-R35 **"validator 健壮性"** 和 **"声明未执行契约"** 模式的自然延伸，但发现了更细的粒度：

### 粒度扩展：字段存在性 → 字段值空性

| 校验粒度 | 示例 | 覆盖轮次 |
|---------|------|---------|
| 字段集合（封闭性） | 拒绝未知字段 `lisense` | R33 |
| 字段存在性 | 必填字段不能 undefined/null/'' | R1 |
| 字段值类型 | `tags` 必须是数组 | R27-R32 |
| 字段值格式 | `addedAt` 必须 YYYY-MM-DD | R5 |
| 字段值有效性 | `addedAt` 必须是真实日期 | R34 |
| 字段值唯一性 | `repo` 跨项目唯一 | R1/R11/R34 |
| 元素值类型 | `tags` 元素必须是字符串 | R27（tags）/ R35（sources） |
| 元素值非空 | `tags`/`sources` 元素非空 | R35 |
| 元素值唯一性 | `tags`/`sources` 元素不重复 | R35 |
| **字段值空性** | `url: ""` / `tags: []` 不得为空值 | **R36** |

R36 确立新校验层：**字段值空性校验**。`url: ""` 与 `url` 省略语义不同，validator 必须区分。空字符串/空数组是"显式写空"，与"省略字段"是两种不同的意图，前者是误写。

### validator 健壮性闭环（R31 → R36）

| 轮次 | 防御层级 | 防御对象 |
|------|---------|---------|
| R31 | 字段级 | 必填字段类型错误后的连锁崩溃（如 `repo.split()` TypeError） |
| R32 | 字段级 | R31 遗漏的可选字段独立后续校验（license SPDX / url 冗余） |
| R36 | **对象级** | **整个项目对象为 null/非对象时的崩溃** |

R31/R32 防御"字段类型错误"，R36 防御"对象类型错误"。R36 后 validator 健壮性 checklist 三层闭环：
1. 对象级（R36）：YAML 解析结果 null/非对象防御
2. 字段级（R31/R32）：字段类型错误后的 typeof 防御
3. 元素级（R35）：数组元素类型错误后的 continue 跳过

### 空值校验的语义基础

空值校验的核心是**语义区分**：

| 字段类型 | 空值写法 | 与省略的语义差异 |
|---------|---------|----------------|
| 字符串字段 | `url: ""` | 空字符串渲染 `<a href="">`，省略不渲染 |
| 数组字段 | `tags: []` | 空数组不渲染，省略也不渲染，但前者是"显式声明无标签"（矛盾：为何要写空字段？） |

**结论**：可选字段要么省略不写，要么提供有效值。空值是"显式写空"的误写，validator 应拒绝。这与 R33 的"封闭契约"理念一致——interface 契约不仅是"哪些字段"，也是"字段值的语义"。

### 与 R35 元素级校验的关系

R35 校验"数组元素非空"（`tags: [cli, ""]` 的 `""` 元素），R36 校验"数组本身非空"（`tags: []`）：

- R35：数组有元素，但元素值空 → 拒绝
- R36：数组无元素 → 拒绝

两者互补，覆盖数组字段的两层空性。R35 后 `tags: [cli, ""]` 被拦截，R36 后 `tags: []` 也被拦截，`string[]` 字段的空性校验完整闭环。

### 至此 validator 契约执行覆盖

R35 八层 + R36 新增一层 = 九层闭环：

1. **字段集合**（R33）：拒绝未知字段
2. **字段存在性**（R1）：必填字段不能 undefined/null/''
3. **字段值类型**（R27-R32）：typeof / Array.isArray 校验
4. **字段值格式**（R5/R9/R11）：日期格式 / SPDX / URL-friendly 正则
5. **字段值有效性**（R34）：日期有效性（构造后回读比对）
6. **字段值唯一性**（R1/R11/R34）：slug / category id / repo 跨项目唯一
7. **字段值空性**（R36）：可选字段不得为空字符串/空数组
8. **元素值类型/非空/唯一性**（R27 tags / R35 sources）：数组元素级三层
9. **对象级防御**（R36）：null/非对象 YAML 防御性检查

九层闭环，validator 数据完整性校验覆盖对象级 + 字段级 + 元素级，且每层都有明确的错误信息和修复指引。
