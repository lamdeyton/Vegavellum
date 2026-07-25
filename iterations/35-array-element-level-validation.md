# R35：tags/sources 数组元素级校验（类型 + 非空 + 唯一）

> 类型：横向审计 gap + 同型字段不一致处理（同 R27-R34 系列扩展，CRITICAL）
> 触发：R34 后三类审计发现 sources 元素类型校验缺失（同 R27 tags 同型遗漏）+ tags/sources 元素唯一性和非空校验缺失
> 子目标影响：1. 数据完整性（CRITICAL：重复/空元素静默通过 → 渲染异常）+ 6. 可扩展性（数组元素级校验模式确立）

## 背景

R34 完成 addedAt 日期有效性和 repo 跨项目唯一性校验后，R34 后三类审计继续寻找横向 gap（字段定义↔使用是否对齐）。

**横向审计发现 5 个同型 gap**：

### Gap 1：sources 元素类型校验缺失（同 R27 tags 同型遗漏）

R27 给 tags 加了元素 `typeof === 'string'` 校验，但 sources 在 R8 只加了枚举校验，**没有同型元素类型校验**：

```javascript
// R35 前：sources 只有枚举校验
for (const s of p.sources) {
  if (!validSources.has(s)) {
    fail(`${label}: sources 值 "${s}" 不在枚举 {...} 内`);
  }
}
```

`sources: [123]` → `validSources.has(123)` 返回 false → 报"sources 值 123 不在枚举内"。

**问题**：这是误导性错误信息（R31 模式）。`123` 的真实问题是类型错误（应为字符串），不是枚举错误。贡献者看到"不在枚举内"会困惑——123 看起来就不在枚举里，但根本原因是类型错了。

### Gap 2：tags 元素唯一性未校验

`tags: [cli, cli, rust]` 重复元素静默通过 → ProjectCard 渲染两个 `#cli` 标签。

### Gap 3：tags 元素非空未校验

`tags: [cli, "", rust]` 空字符串元素静默通过 → ProjectCard 渲染 `#` 空标签。

### Gap 4：sources 元素唯一性未校验

`sources: [community-nominated, community-nominated]` 重复元素静默通过 → 详情页渲染"社区 PR 提名、社区 PR 提名"。

### Gap 5：sources 元素非空未校验

`sources: [community-nominated, ""]` 空字符串静默通过 → 枚举校验报"不在枚举内"（已拦截，但错误信息不准确——根本原因是空字符串无效，不是枚举问题）。

## 抓到的 bug

### N1（CRITICAL）sources 元素类型错误报误导性"不在枚举内"

**问题代码（R35 前）**：sources 元素只有枚举校验，无类型校验。

**负向测试证据**：`sources: [community-nominated, community-nominated, 123, ""]`

**修复前**（基于代码追踪）：
- `123` → `validSources.has(123)` false → 报"sources 值 123 不在枚举内"（误导性，根本是类型错误）

### N2（CRITICAL）tags 元素重复静默通过

`tags: [cli, cli, "", rust]` → 重复 `cli` 静默通过 → 渲染两个 `#cli`

### N3（CRITICAL）tags 元素空字符串静默通过

同上测试文件 → 空字符串 `""` 静默通过 → 渲染 `#` 空标签

### N4（CRITICAL）sources 元素重复静默通过

`sources: [community-nominated, community-nominated]` → 重复静默通过 → 详情页渲染重复来源

### N5（CRITICAL）sources 元素空字符串静默通过

`sources: [..., ""]` → 空字符串静默通过 → 枚举校验报"不在枚举内"（误导性错误信息）

## 修复方案

### 修复 1：sources 元素级校验（类型 + 非空 + 唯一 + 枚举）

```javascript
if (p.sources !== undefined) {
  if (!Array.isArray(p.sources)) {
    fail(`${label}: sources 必须是数组，当前类型为 ${typeof p.sources}`);
  } else {
    const seenSources = new Set();
    for (const s of p.sources) {
      // 元素类型校验（R35：同 R27 tags 同型对齐，防误导性"不在枚举内"错误）
      if (typeof s !== 'string') {
        fail(`${label}: sources 元素 "${String(s)}" 必须是字符串，当前类型为 ${typeof s}`);
        continue; // 跳过后续校验，避免 Set.has(非字符串) 误报"不在枚举内"
      }
      // 元素非空校验（R35）
      if (s === '') {
        fail(`${label}: sources 元素为空字符串，无效`);
        continue;
      }
      // 元素唯一性校验（R35）
      if (seenSources.has(s)) {
        fail(`${label}: sources 元素 "${s}" 重复`);
        continue;
      }
      seenSources.add(s);
      // 枚举值校验（CONTRIBUTING + 设计方案声明的契约）
      if (!validSources.has(s)) {
        fail(`${label}: sources 值 "${s}" 不在枚举 {...} 内`);
      }
    }
  }
}
```

**关键设计**：
- 类型校验在枚举校验之前（R31 模式：类型错误优先报告，避免误导性"不在枚举内"）
- `continue` 跳过同一元素的后续校验，避免多次报错（如 `123` 不会同时报"类型错误"和"不在枚举内"）
- 校验顺序：类型 → 非空 → 唯一 → 枚举（从根本到具体）

### 修复 2：tags 元素级校验（类型 + 非空 + 唯一）

```javascript
if (p.tags !== undefined) {
  if (!Array.isArray(p.tags)) {
    fail(`${label}: tags 必须是数组，当前类型为 ${typeof p.tags}（应使用 YAML 数组语法，如 [cli, rust]）`);
  } else {
    const seenTags = new Set();
    for (const t of p.tags) {
      // 元素类型校验（R27）
      if (typeof t !== 'string') {
        fail(`${label}: tags 元素 "${String(t)}" 必须是字符串，当前类型为 ${typeof t}`);
        continue;
      }
      // 元素非空校验（R35）
      if (t === '') {
        fail(`${label}: tags 元素为空字符串，无效`);
        continue;
      }
      // 元素唯一性校验（R35）
      if (seenTags.has(t)) {
        fail(`${label}: tags 元素 "${t}" 重复`);
        continue;
      }
      seenTags.add(t);
    }
  }
}
```

### 修复 3：同步 validator 头注释和 README

- validator 头注释新增"tags 元素：非空字符串 + 唯一"和"sources 元素：非空字符串 + 唯一 + 类型校验"
- README "数据校验"描述更新："tags 数组类型" → "tags/sources 数组类型与元素非空/唯一性"

## MVP 回归

### 正向验证（现有数据）

```
✓ npm run validate（0 错误 0 警告）
✓ npm run build（16 页面构建完成，477ms）
```

### 负向验证（5 类元素级违规）

创建临时 `data/projects/r35test.yaml`，同时触发 5 类违规：

```yaml
name: r35test
slug: r35test
repo: test-owner/r35test
description: R35 test fixture
category: cli
addedAt: 2026-07-25
status: pending
sources: [community-nominated, community-nominated, 123, ""]
tags: [cli, cli, "", rust]
```

```
▸ 项目数据
  ✗ r35test.yaml: sources 元素 "community-nominated" 重复
  ✗ r35test.yaml: sources 元素 "123" 必须是字符串，当前类型为 number
  ✗ r35test.yaml: sources 元素为空字符串，无效
  ✗ r35test.yaml: tags 元素 "cli" 重复
  ✗ r35test.yaml: tags 元素为空字符串，无效
  ⚠ r35test.yaml: status=pending，该项目不会在站点上显示，等待维护者审核

────────────────────────
  错误：5
  警告：1
────────────────────────
```

✓ 5 类违规全部精准识别
✓ sources 元素 `123` 报"必须是字符串，当前类型为 number"（类型错误优先，非误导性"不在枚举内"）
✓ sources 元素 `""` 报"为空字符串，无效"（非误导性"不在枚举内"）
✓ 重复元素检测正确（第一个加入 Set，第二个报重复）
✓ exit 1（CI 会失败，PR 被拦截）

恢复数据后 `npm run validate` 通过（0 错误 0 警告）。

## 审计反思

R35 是 R27-R34 **"同型字段不一致处理"模式**和**"声明但未执行的契约"模式**的自然延伸，但发现了更细的粒度：

### 粒度扩展：字段级 → 元素级

| 校验粒度 | 示例 | 覆盖轮次 |
|---------|------|---------|
| 字段集合（封闭性） | 拒绝未知字段 `lisense` | R33 |
| 字段值类型 | `tags` 必须是数组 | R27 |
| 字段值格式 | `addedAt` 必须 YYYY-MM-DD | R5 |
| 字段值有效性 | `addedAt` 必须是真实日期 | R34 |
| 字段值唯一性 | `repo` 跨项目唯一 | R1/R11/R34 |
| **元素值类型** | `tags` 元素必须是字符串 | R27（tags）/ **R35（sources）** |
| **元素值非空** | `tags`/`sources` 元素非空 | **R35** |
| **元素值唯一性** | `tags`/`sources` 元素不重复 | **R35** |

R27 加了 tags 元素类型校验，但 R27 只覆盖了"元素是字符串"，没覆盖"元素非空"和"元素唯一"。R35 补全了 tags 的非空和唯一性，并同步给 sources 加了元素类型、非空、唯一性（与 tags 同型对齐）。

### 同型字段不一致处理的再扩展

| 同型对 | 校验对齐情况 |
|--------|-------------|
| tags vs sources（`string[]`） | R27 tags 元素类型 ✓ / sources 元素类型 ✗ → **R35 补全** |
| tags vs sources（元素非空） | R35 前两者都 ✗ → **R35 补全** |
| tags vs sources（元素唯一） | R35 前两者都 ✗ → **R35 补全** |

R29 确立"interface 间同型对齐"（Project ↔ Category），R31 确立"必填 vs 可选同型对齐"，R35 确立"数组元素级同型对齐"——同型 `string[]` 字段的元素校验逻辑应完全一致。

### 误导性错误信息模式（R31 扩展）

R31 确立"类型错误导致崩溃或误导性错误"模式，R32 补全 2 处遗漏。R35 发现同型模式：

| 场景 | 误导性错误 | R35 修复 |
|------|-----------|---------|
| `sources: [123]` | "sources 值 123 不在枚举内" | "sources 元素 123 必须是字符串，当前类型为 number" |
| `sources: [""]` | "sources 值  不在枚举内" | "sources 元素为空字符串，无效" |

**教训**：枚举校验隐式假设元素是字符串，非字符串元素会触发误导性"不在枚举内"错误。枚举校验前必须加 typeof 校验，类型错误优先报告。

### `continue` 模式的健壮性

R35 引入 `continue` 模式：元素级校验中，类型错误后 `continue` 跳过后续校验，避免同一元素多次报错：

```javascript
if (typeof s !== 'string') {
  fail(`...必须是字符串...`);
  continue; // 跳过非空/唯一/枚举校验
}
```

这与 R31 的"防御性 typeof"模式互补：
- R31：字段级防御性 typeof，避免后续校验崩溃
- R35：元素级 continue，避免同一元素多次报错

两者都是为了**错误信息准确性**——让贡献者看到根本原因，而非连锁错误。

### 与 R33 字段集合契约的关系

R33 确立"interface 是封闭契约（字段集合）"，R35 确立"`string[]` 是元素契约（元素集合）"：

- R33：YAML 中只能出现 interface 声明的字段（字段集合封闭性）
- R35：`string[]` 数组中元素必须非空、唯一、类型正确（元素集合契约）

两者都是"集合封闭性"的执行，只是粒度不同——R33 是字段集合，R35 是元素集合。

至此 validator 契约执行覆盖五层：
1. **字段集合**（R33）：拒绝未知字段
2. **字段值类型**（R27-R32）：typeof / Array.isArray 校验
3. **字段值格式**（R5/R9/R11）：日期格式 / SPDX / URL-friendly 正则校验
4. **字段值有效性**（R34）：日期有效性（构造后回读比对）
5. **字段值唯一性**（R1/R11/R34）：slug / category id / repo 跨项目唯一

加上 R35 的元素级三层：
6. **元素值类型**（R27 tags / R35 sources）：typeof 校验
7. **元素值非空**（R35）：空字符串校验
8. **元素值唯一性**（R35）：Set 检测重复

八层闭环，validator 数据完整性校验覆盖字段级 + 元素级。
