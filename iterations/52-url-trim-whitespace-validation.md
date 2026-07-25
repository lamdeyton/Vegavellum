# R52：url 字段 trim() 空白校验（R37 同型遗漏补全）

> **轮次类型**：Horizontal gap 修复（同型对齐全链路）
> **触发**：R51 后续水平审计发现 R37 trim() 空白校验未覆盖 url 字段
> **严重度**：MINOR（不崩溃、不 XSS，但渲染层生成含空格 href，与 R37 模式不一致）

## 背景

R37 给所有 free-text 字段加了 `trim()` 空白校验：
- Project：`name` / `description`（free-text 必填）
- Project：`license` / `language`（free-text 可选）
- Project：`repo`（前后空格 + 中间空格，R37 + R40）
- Category：`id` / `name` / `name_en` / `icon` / `description`

但 `url` 字段被遗漏。R48/R49 给 url 加了协议白名单校验（防 XSS），R36 加了空字符串校验，但**没有 trim() 空白校验**。

## Gap 分析

### 攻击向量 1：前后空格

```yaml
url: " https://astro.build "
```

**验证链路**：
1. `p.url === ''` → false（不是空字符串）
2. `typeof p.url !== 'string'` → false（是字符串）
3. `new URL(" https://astro.build ")` → **成功**（URL 构造函数内部 trim 空白）
4. `parsed.protocol === 'https:'` → true
5. **校验通过** ✗（gap）

**渲染结果**：
```html
<a href=" https://astro.build ">官网 ↗</a>
```
href 属性含前导/尾部空格。浏览器会 trim 后导航，但 HTML 不干净，与 R37 模式不一致。

### 攻击向量 2：纯空白字符串

```yaml
url: "   "
```

**验证链路**（R52 修复前）：
1. `p.url === ''` → false
2. `typeof p.url !== 'string'` → false
3. `new URL("   ")` → 抛错
4. catch 块报：`url "   " 不是合法 URL` ✗

**问题**：错误信息是"不是合法 URL"，但真实问题是"空白字符串"。这违反 R31 模式——空性错误应优先于格式校验报告，避免误导性错误信息。

### 同型对齐分析

| 字段 | 空字符串 | trim()==='' | url!==url.trim() | 备注 |
|------|---------|-------------|-------------------|------|
| name | R36 | R37 | R37 | ✓ 完整 |
| description | R36 | R37 | R37 | ✓ 完整 |
| license | R36 | R37 | R37 | ✓ 完整 |
| language | R36 | R37 | R37 | ✓ 完整 |
| repo | R36 | R37 | R37（+ R40 中间空格） | ✓ 完整 |
| **url** | R36 | **✗ 遗漏** | **✗ 遗漏** | **R52 修复** |

R37 同型遗漏的根本原因：url 字段有 URL 格式校验（`new URL()`）"掩盖"了空白校验的缺失。URL 构造函数内部 trim 行为让前后空格通过格式校验，纯空白字符串被格式校验捕获但报误导性错误。

## 修复方案

### 1. validator（`scripts/validate-data.mjs`）

在 URL 格式校验**之前**加两层 trim 校验：

```javascript
if (p.url === '') {
  fail(`${label}: url 为空字符串...`);
} else if (p.url !== undefined) {
  if (typeof p.url !== 'string') {
    fail(`${label}: url 必须是字符串...`);
  } else if (p.url.trim() === '') {
    // R52：空白字符串校验（R31 模式：空性错误优先于格式校验）
    fail(`${label}: url 为空白字符串（仅含空格/制表符/换行）...`);
  } else if (p.url !== p.url.trim()) {
    // R52：前后空格校验（R37 同型对齐）
    fail(`${label}: url "${p.url}" 含前导/尾部空格，应为 "${p.url.trim()}"`);
  } else {
    try {
      const parsed = new URL(p.url);
      // R48 协议白名单...
    } catch {
      fail(`${label}: url "${p.url}" 不是合法 URL...`);
    }
  }
}
```

**关键设计**：
- `trim() === ''` 在 URL 格式校验之前，避免误导性"不是合法 URL"错误（R31 模式）
- `url !== url.trim()` 提供修正值（trim 后的 url），与 R37 license/language/repo 同型

### 2. 渲染层防御（`src/lib/data.ts` `sanitizeProjectUrl`）

R49 的 `sanitizeProjectUrl` 原实现返回**原始 url**（含空格）。R52 改为返回 **trim 后的 url**：

```javascript
const trimmed = url.trim();
if (trimmed === '') {
  console.error(`...`);
  return undefined;
}
try {
  const parsed = new URL(trimmed);
  // 协议白名单...
  return trimmed;  // R52：返回 trim 后的值，不返回原始 url
} catch {
  // ...
}
```

**关键设计**：
- 先 trim 再校验，与 R37 字段级 trim 同型对齐
- `trimmed === ''` 同时覆盖空字符串和纯空白字符串（R49 原实现只检查 `url === ''`）
- 返回 `trimmed` 而非 `url`，确保渲染层 href 无前导/尾部空格
- dev 逃生口（`npx astro dev`）下 validator 不跑，sanitizeProjectUrl 是唯一守门员

## 攻击样本验证

### 攻击样本 1：前后空格

```yaml
# data/projects/r52-attack-sample.yaml
url: " https://astro.build "
```

**R52 修复前**：
```
✓ 数据校验通过（含警告，不影响构建）。
```
（gap：url 含空格但通过校验）

**R52 修复后**：
```
✗ r52-attack-sample.yaml: url " https://astro.build " 含前导/尾部空格，应为 "https://astro.build"
✗ 数据校验失败，请修复上述错误。
```
（拦截成功，提供修正值）

### 攻击样本 2：纯空白字符串

```yaml
# data/projects/r52-whitespace-attack.yaml
url: "   "
```

**R52 修复后**：
```
✗ r52-whitespace-attack.yaml: url 为空白字符串（仅含空格/制表符/换行），要么不写该字段，要么写有效 URL（如 https://example.com）
```
（拦截成功，R31 模式：空性错误优先于格式校验，错误信息准确）

### MVP 回归

删除攻击样本后：
```
✓ 数据校验通过。（0 错误 0 警告）
✓ Completed in 69ms.
[build] 16 page(s) built in 456ms
```

## 模式确立

### URL 构造函数内部 trim 反模式

`new URL(" https://example.com ")` 内部 trim 空白后解析成功，掩盖了原始字符串的空格问题。**URL 格式校验不能替代 trim() 空白校验**——格式校验验证的是"解析后的 URL"，trim 校验验证的是"原始字符串"，两者维度不同。

同型对齐扩展：所有有"格式校验"的字段（url 有 `new URL()`，repo 有 `split('/')`）仍需独立的 trim() 空白校验，因为格式校验函数可能内部 trim 或 String() 转换，掩盖原始字符串的空格问题。

### R31 模式再次确认

空性校验（`trim() === ''`）必须在格式校验（`new URL()`）之前，避免误导性错误信息：
- `url: "   "` → R31 模式报"为空白字符串"（准确）
- `url: "   "` → 格式校验报"不是合法 URL"（误导，真实问题是空性而非格式）

R52 与 R31（必填字段 typeof 优先）/ R35（sources 元素类型优先于枚举）/ R39（tags 元素 trim 优先于唯一性）同型——**空性/类型错误优先于格式/枚举校验**。

### 渲染层防御 trim 返回模式

R49 原实现 `return url`（原始值），R52 改为 `return trimmed`（trim 后）。确立模式：**渲染层防御函数应返回规范化后的值，而非原始值**。validator 负责报告（让贡献者修复源数据），渲染层负责防御（确保渲染产物干净）。两层职责分离：validator 是"报告员"，渲染层是"守门员"。

## 文档同步

- `scripts/validate-data.mjs` 头部注释：新增 url 空白校验条目
- `README.md` 数据校验描述：补充 url 空白校验
- `CONTRIBUTING.md` 本地验证描述：补充 url 空白校验
- `iterations/README.md`：新增 R52 轮次索引 + 子目标演进表

## 同型对齐矩阵（R37 trim() 空白校验完整覆盖）

| 字段 | 对象级 | 字段级 typeof | 字段级 trim()==='' | 字段级 !==trim() | 元素级 |
|------|--------|--------------|---------------------|-------------------|--------|
| name | R36 | R31 | R37 | R37 | N/A |
| slug | R36 | R31 | R11 间接 | R11 间接 | N/A |
| repo | R36 | R31 | R37 间接 | R37 + R40 中间 | N/A |
| description | R36 | R31 | R37 | R37 | N/A |
| category | R36 | R31 | R11 间接 | R11 间接 | N/A |
| addedAt | R36 | R31 | R34 间接 | R34 间接 | N/A |
| status | R36 | R31 | 枚举 | 枚举 | N/A |
| **url** | R36 | R28 | **R52** | **R52** | N/A |
| license | R36 | R28 | R37 | R37 | N/A |
| language | R36 | R28 | R37 | R37 | N/A |
| tags | R36 | R27 | R36 空数组 | N/A | R35 + R39 |
| sources | R36 | R35 | R36 空数组 | N/A | R35 + R39 |
| Category.id | R37 | R29 | R11 间接 | R11 间接 | N/A |
| Category.name | R37 | R29 | R37 | R37 | N/A |
| Category.name_en | R37 | R29 | R37 | R37 | N/A |
| Category.icon | R37 | R29 | R37 | R37 | N/A |
| Category.description | R37 | R29 | R37 | R37 | N/A |

R52 后，所有 free-text 字段的 trim() 空白校验完整覆盖。
