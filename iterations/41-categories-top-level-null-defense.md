# R41：categories.yaml 顶层 null/非数组防御性检查（R36 同型遗漏补全）

## 触发（外部压力）

R40 完成后三类审计（vertical/horizontal/connection）发现 horizontal gap：

- **Vertical 审计**：data.ts `getAllCategories()` 返回 `parse(raw) as Category[]`，无 null 防御；但 validator 兜底，CI 拦截——dev 模式问题，按 MVP 原则可接受。
- **Horizontal 审计（CRITICAL gap）**：validator 第 73 行 `parseYaml(categoriesRaw) ?? []` 与第 87-90 行 Project `parseYaml(raw)`（无 `??`）**同型数据处理不一致**。
- **Connection 审计**：R36 给 Project 单文件加了顶层 null 防御（循环内 `if (p === null)` 报错），但 categories.yaml 是单文件，`?? []` 掩盖了顶层 null——**R36 同型遗漏**。

## Gap 描述

原代码：
```js
const categories = parseYaml(categoriesRaw) ?? [];
```

`?? []` 用空数组兜底 null，掩盖了 categories.yaml 顶层 null（空文件/仅注释），validator 静默通过：
- 循环 `for (const c of categories)` 不执行（空数组）
- 无任何报错
- CI 通过，部署到 GitHub Pages
- 但 data.ts `getAllCategories()` 返回 `parse(raw) as Category[]`（实际 null）
- 首页 `CategoryList.astro` 组件 `.map()` 在 null 上崩溃 → `TypeError: Cannot read properties of null`

**攻击样本分析**（R41 修复前）：

| categories.yaml 内容 | YAML 解析结果 | `?? []` 后 | validator 行为 | CI | 渲染层 |
|---------------------|--------------|-----------|---------------|-----|--------|
| 空文件/仅注释 | `null` | `[]` | 静默通过（循环不执行） | ✓ 通过 | ❌ 崩溃 |
| `foo: bar`（顶层 mapping） | `{foo:'bar'}` | `{foo:'bar'}` | `for...of` 抛 TypeError | ❌ 失败（但错误信息不友好） | ❌ 崩溃 |
| `"string"`（顶层标量） | `"string"` | `"string"` | 迭代字符，c.id 是 undefined，报"缺少 id"误导 | ❌ 失败（误导性错误） | ❌ 崩溃 |

**根因**：`?? []` 是"静默兜底"而非"显式报错"，掩盖了数据契约违例。R36 给 Project 单文件加了显式 null 报错（`if (p === null) fail(...)`），但 categories.yaml 作为单文件被 `?? []` 静默处理，同型防御遗漏。

## 修复

```js
const categoriesParsed = parseYaml(categoriesRaw);
let categories;
if (categoriesParsed === null || categoriesParsed === undefined) {
  fail(`categories.yaml 为空或仅含注释（YAML 解析为 null），请填写分类数据`);
  categories = [];
} else if (!Array.isArray(categoriesParsed)) {
  fail(`categories.yaml 顶层必须是数组（YAML sequence，用 "- " 开头），当前类型为 ${typeof categoriesParsed}，请检查缩进或是否误写为 mapping/scalar`);
  categories = [];
} else {
  categories = categoriesParsed;
}
```

**设计要点**：
1. **删除 `?? []`**：不再静默兜底，改为显式检查 + 报错。
2. **null/undefined 检查**：同型对齐 R36 Project 顶层 null 防御，报错信息明确指出"空文件/仅注释"。
3. **非数组检查**：防 YAML 顶层是 mapping（对象）或 scalar（字符串/数字），报错信息提示"YAML sequence，用 '- ' 开头"和"检查缩进"。
4. **fail 后 `categories = []` 兜底**：避免后续代码（categoryIds 计算、console.log、for 循环）崩溃，让 validator 继续报告其他错误（如项目 category 引用断裂）。
5. **错误信息可行动**：告诉贡献者"请填写分类数据"或"请检查缩进"，而非笼统的"数据格式错误"。

## 攻击样本验证（R41 修复后）

| 攻击样本 | 修复前 | 修复后 |
|---------|--------|--------|
| 空文件/仅注释 | 静默通过 ❌ | `✗ categories.yaml 为空或仅含注释（YAML 解析为 null），请填写分类数据` ✓ |
| `foo: bar`（mapping） | TypeError 不友好 ❌ | `✗ categories.yaml 顶层必须是数组（YAML sequence，用 "- " 开头），当前类型为 object，请检查缩进或是否误写为 mapping/scalar` ✓ |
| `"string"`（scalar） | 迭代字符，误导性"缺少 id" ❌ | `✗ categories.yaml 顶层必须是数组（YAML sequence，用 "- " 开头），当前类型为 string，请检查缩进或是否误写为 mapping/scalar` ✓ |

三个攻击样本全部正确报错，exit code 1（CI 拦截）。

## MVP 回归验证

- `npm run validate`：✓ 0 错误 0 警告（5 项目 9 分类）
- `npm run build`：✓ 16 页面构建成功（404 + 9 分类 + 5 项目 + 首页）

## 教训（同型对齐模式扩展）

**R36 同型遗漏模式**：R36 给 Project 单文件加了顶层 null 防御，但同型的 categories.yaml 单文件被 `?? []` 掩盖。教训扩展：

1. **`?? []` 是反模式**：静默兜底掩盖数据契约违例，应改为显式检查 + 报错 + 兜底（兜底是为避免后续崩溃，不是掩盖错误）。
2. **同型数据处理必须同型防御**：Project 文件和 categories.yaml 都是 YAML 单文件，应使用相同的顶层 null/非对象/非数组防御模式。
3. **修复一处防御时审计所有同型兜底**：R36 修复时应审计所有 `?? []` / `|| []` / `?? {}` 静默兜底，而非只修复循环内的 null 检查。
4. **fail 后兜底模式确立**：`fail()` 不退出，需在 fail 后用空集合兜底（`categories = []`），让 validator 继续报告其他错误，而非崩溃或跳过后续校验。

**validator 健壮性五层闭环**（R36-R41 演进）：
- 对象级（R36/R37）：YAML 顶层 null/非对象 + 数组元素 null/非对象
- 字段级（R37）：free-text 空白字符串
- 元素级（R39）：tags/sources 元素空白字符串
- 字段值 trim 空性（R37/R40）：repo 前后/中间空格
- **顶层类型级（R41）**：categories.yaml 顶层必须是数组（防 mapping/scalar）

## 文件变更

- `scripts/validate-data.mjs`：删除 `?? []`，加 categories.yaml 顶层 null/非数组防御性检查；更新文件头注释。
- `iterations/README.md`：新增 R41 条目。
- `iterations/41-categories-top-level-null-defense.md`：本文件。
- `README.md`：数据校验描述同步 R41。
