# R45：getAllCategories 元素级 null 防御（R37 同型遗漏，R44 friction chain）

## 触发（外部压力）

R44 修复了 `getAllCategories()` 顶层 null/非数组防御后，post-fix 三类审计发现 element-level 同型遗漏：

- **R44** 修复了**顶层** null/非数组（空文件 / mapping / scalar）
- **但** YAML 数组内的 null 元素（`- null`）未被 R44 顶层检查捕获：
  - `parse(raw)` 返回 `[null, {id: 'frontend-framework', ...}]`
  - `Array.isArray([null, {...}])` 为 true → R44 检查通过
  - 直接 `return parsed as Category[]` → 返回含 null 元素的数组
  - 调用方 `[id].astro getStaticPaths()`：`categories.map(c => ({ params: { id: c.id } }))` → 首次迭代 `null.id` → **TypeError: Cannot read properties of null**

这是 R44 的 **friction chain**：修复顶层后发现元素级同型问题。也是 R37（validator 层 Category 元素 null 防御）在 data.ts 读取层的同型遗漏。

## Gap 描述

### 攻击场景（dev 模式）

1. 贡献者编辑 `data/categories.yaml`，误在某行只写 `-`（YAML 解析为 null 元素）
2. 运行 `npm run dev`（不跑 validator）
3. `parse(raw)` 返回 `[null, {id: 'frontend-framework', ...}, ...]`
4. `getAllCategories()` R44 检查：`Array.isArray([null, {...}])` 为 true → 通过
5. 返回 `[null, {id: 'frontend-framework', ...}, ...]`
6. `[id].astro getStaticPaths()`：`categories.map(c => ({ params: { id: c.id }, props: { category: c } }))`
7. 首次迭代：`null.id` → **TypeError: Cannot read properties of null (reading 'id')**
8. `getStaticPaths` 抛错 → Astro build/dev 完全失败，整站不可用

### 同型对齐分析

| 层 | 顶层 null 防御 | 元素级 null 防御 |
|----|---------------|-----------------|
| validator | R41（categories.yaml 顶层 null/非数组） | R37（Category 数组元素 null/非对象） |
| data.ts | R44（`getAllCategories` 顶层 null/非数组） | **R45 修复前：缺失** ❌ |

R44 完成了 validator ↔ data.ts 的顶层防御对齐，但元素级防御是同型遗漏。R37 给 validator 加了 Category 元素 null 检查，data.ts 读取层未同步。

`getAllProjects()` R44 已有元素级 filter（`projects.filter((p): p is Project => ...)`），但 `getAllCategories()` R44 只检查顶层未 filter 元素——同函数内同型不一致。

## 修复

```typescript
export function getAllCategories(): Category[] {
  const raw = readFileSync(join(dataDir, 'categories.yaml'), 'utf8');
  const parsed = parse(raw);
  // R44：顶层 null/非数组防御（省略详细注释）
  if (parsed === null || parsed === undefined) { ... return []; }
  if (!Array.isArray(parsed)) { ... return []; }
  // R45：R37 同型遗漏修复（element-level defense）。
  // R44 修复了顶层 null/非数组，但数组内的 null 元素（`- null`）仍会让调用方崩溃：
  //   [id].astro getStaticPaths() → categories.map(c => ({ params: { id: c.id } })) → null.id TypeError
  // R37 给 validator 加了 Category 元素 null 防御，data.ts 读取层是同型遗漏。
  // 与 getAllProjects() R44 filter 同型对齐：过滤非对象元素 + 报告无效条目指引 validator。
  for (const c of parsed) {
    if (c === null || c === undefined || typeof c !== 'object' || Array.isArray(c)) {
      console.error(`[Vegavellum] 检测到空条目或非对象分类数据（类型：${c === null ? 'null' : Array.isArray(c) ? 'array' : typeof c}）。请运行 \`npm run validate\` 检查 data/categories.yaml。`);
    }
  }
  return parsed.filter(
    (c): c is Category => c !== null && c !== undefined && typeof c === 'object' && !Array.isArray(c)
  );
}
```

## MVP 回归验证

### 正常数据回归

```
npm run validate  → ✓ 0 错误 0 警告（5 项目 9 分类）
npm run build     → ✓ 16 页面构建成功
```

### 攻击样本验证（CRITICAL）

**测试方法**：临时将 `data/categories.yaml` 替换为 `- null` + 一个有效分类，运行 build。

**修复前行为**（推断）：
- `parse(raw)` 返回 `[null, {id: 'frontend-framework', ...}]`
- `Array.isArray` 为 true → R44 通过
- `[id].astro getStaticPaths()` → `categories.map(c => c.id)` → `null.id` TypeError
- build 失败

**修复后行为**（实测）：
```
[Vegavellum] 检测到空条目或非对象分类数据（类型：null）。请运行 `npm run validate` 检查 data/categories.yaml。
10:40:25   └─ /category/frontend-framework/index.html  ← 有效分类仍渲染
10:40:25   └─ /index.html
10:40:25   ├─ /project/astro/index.html
...
10:40:25 [build] Complete!
```

- ✓ 无 TypeError 崩溃
- ✓ 错误日志清晰指引运行 `npm run validate`
- ✓ 有效分类（frontend-framework）仍正常渲染静态页
- ✓ null 元素被过滤，不阻塞其他有效数据

恢复数据后：✓ 0 错误 + 16 页面构建成功。

## 教训（friction chain + 同函数同型对齐）

**friction chain 模式再次确认**：
- R44（顶层）→ R45（元素级）是典型的 friction chain：修复一层防御后立即暴露下一层同型问题
- 与 R37→R38（validator 层的同类 friction chain）对称：R37 修复循环内 null 防御，R38 修复循环前 `.map((c) => c.id)` 防御
- 教训：修复 top-level 防御后必须立即审计 element-level，两者是同型对齐关系

**同函数同型对齐模式**：
- `getAllProjects()` R44 已有元素级 filter
- `getAllCategories()` R44 只做顶层检查未 filter 元素
- 同一文件内两个同型函数（都是 `getAllXxx` 读取 YAML 数组）防御深度不一致
- 教训：修复一个函数的防御深度时，必须审计同文件内同型函数（`getAllXxx` 系列）的防御深度对齐

**三层防御闭环扩展**：
- R44 确立：validator（CI）+ data.ts（渲染）+ TypeScript interface（编译时）
- R45 扩展：每层的防御深度必须对齐——validator 有顶层+元素级两层防御，data.ts 也必须有顶层+元素级两层
- 防御深度对齐矩阵：

| 层 | 顶层防御 | 元素级防御 |
|----|---------|-----------|
| validator | R36/R41 | R36/R37 |
| data.ts | R44 | R45 |
| TypeScript | interface 类型 | （编译时无元素级，运行时靠 data.ts） |

## 文件变更

- `src/lib/data.ts`：`getAllCategories()` 加 R45 元素级 null/非对象 filter + 报告，与 `getAllProjects()` R44 filter 同型对齐。
- `iterations/README.md`：新增 R45 条目 + R45 列到 6 子目标演进表。
- `iterations/45-getallcategories-element-level-null-defense.md`：本文件。
