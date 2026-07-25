# R46：tags 字段渲染层 Array.isArray 防御（R27 horizontal + connection gap 修复）

## 触发（外部压力）

R44/R45 完成后三类审计发现 tags 字段在渲染层的 horizontal gap：

- **R27** 给 validator 加了 `tags` 字段 `Array.isArray` 校验（同型对齐 sources）
- **[slug].astro 第 18 行** 对 `sources` 字段用 `Array.isArray(project.sources) ? project.sources : []` 做了渲染层防御性归一化
- **但 [slug].astro 第 107 行 和 ProjectCard 第 38 行** 对 `tags` 字段只用 `project.tags && project.tags.length > 0` 检查，未用 `Array.isArray`

同文件内 sources 和 tags 同型字段处理不一致，是 R27 在渲染层的同型遗漏。R44/R45 修复了 data.ts 读取层的 top-level + element-level 防御，但字段级防御（field-level defense）仍未传播到渲染层。

## Gap 描述

### 攻击场景（dev 模式）

1. 贡献者误写 `tags: cli`（字符串而非数组，YAML 中 `cli` 不带方括号会被解析为字符串）
2. 运行 `npm run dev`（不跑 validator，R27 的 Array.isArray 校验只在 CI）
3. `parse(raw)` 返回 `{tags: "cli", ...}`
4. data.ts `getAllProjects()` R44 检查通过（p 是对象，非 null）
5. 渲染 ProjectCard 第 38 行：`project.tags && project.tags.length > 0`
   - `project.tags` = "cli"（truthy）
   - `project.tags.length` = 4（字符串长度，>0）
   - 进入 `project.tags.map((t) => <li>#{t}</li>)`
   - 字符串没有 `.map()` 方法 → **TypeError: project.tags.map is not a function**
6. 整个使用 ProjectCard 的页面（首页 + category 页）全部崩溃

### 同型对齐分析

| 字段 | validator 校验 | 渲染层防御 |
|------|---------------|-----------|
| sources | R35（Array.isArray + 元素级） | [slug].astro 第 18 行 `Array.isArray(...) ? ... : []` ✓ |
| tags | R27（Array.isArray）+ R35（元素级）+ R39（空白） | **R46 修复前：`project.tags && project.tags.length > 0`** ❌ |

同文件内 sources 和 tags 同为 `string[]` 可选字段，但渲染层防御深度不一致。R44 确立了"validator 层 ↔ data.ts 读取层"同型对齐，R46 扩展到"validator 层 ↔ 渲染层"同型对齐。

## 修复

### 修复 1：ProjectCard 第 38 行

```astro
<!-- 修复前 -->
{project.tags && project.tags.length > 0 && (
  <ul class="tags">
    {project.tags.map((t) => <li>#{t}</li>)}
  </ul>
)}

<!-- 修复后 -->
{Array.isArray(project.tags) && project.tags.length > 0 && (
  <ul class="tags">
    {project.tags.map((t) => <li>#{t}</li>)}
  </ul>
)}
```

### 修复 2：[slug].astro 第 107 行

```astro
<!-- 修复前 -->
{project.tags && project.tags.length > 0 && (
  <section class="tags-section">
    <h2>标签</h2>
    <ul class="tags">
      {project.tags.map((t) => <li>#{t}</li>)}
    </ul>
  </section>
)}

<!-- 修复后 -->
{Array.isArray(project.tags) && project.tags.length > 0 && (
  <section class="tags-section">
    <h2>标签</h2>
    <ul class="tags">
      {project.tags.map((t) => <li>#{t}</li>)}
    </ul>
  </section>
)}
```

## MVP 回归验证

### 正常数据回归

```
npm run validate  → ✓ 0 错误 0 警告（5 项目 9 分类）
npm run build     → ✓ 16 页面构建成功
```

### 攻击样本验证（CRITICAL）

**测试方法**：临时将 `data/projects/nextjs.yaml` 的 `tags` 字段改为字符串 `tags: cli`，运行 build。

**修复前行为**（推断）：
- `project.tags` = "cli"（truthy，length=4>0）
- `project.tags.map(...)` → TypeError: map is not a function
- build 失败，首页 + category 页 + project 页全部崩溃

**修复后行为**（实测）：
```
11:00:37 [build] 16 page(s) built in 928ms
11:00:37 [build] Complete!
```

- ✓ 无 TypeError 崩溃
- ✓ build 16 页面成功（与正常状态相同）
- ✓ tags 字段非数组时静默跳过渲染（与字段省略语义一致），不显示标签区域

恢复数据后：✓ 0 错误 + 16 页面构建成功。

## 教训（同型对齐全链路扩展）

**同型对齐全链路模式确立**：

1. **validator → data.ts → 渲染层三层同型对齐**：
   - R44/R45 完成 validator ↔ data.ts 的 top-level + element-level 对齐
   - R46 扩展到 validator ↔ 渲染层的 field-level 对齐
   - 全链路：validator（CI）→ data.ts（读取）→ 渲染层（组件/页面）三层防御深度必须对齐

2. **同文件内同型字段防御一致**：
   - [slug].astro 第 18 行 sources 用 Array.isArray
   - [slug].astro 第 107 行 tags 修复前未用 Array.isArray
   - 同文件内同型字段（都是 `string[]` 可选）防御深度必须一致

3. **truthy 检查不是类型检查**：
   - `project.tags && project.tags.length > 0` 的 truthy 检查对字符串、数组都返回 true
   - 字符串有 length 属性（>0），但无 `.map()` 方法
   - Array.isArray 是唯一可靠的数组类型判断

4. **防御深度矩阵扩展**：

| 层 | top-level | element-level | field-level |
|----|-----------|---------------|-------------|
| validator | R36/R41 | R36/R37 | R27/R28/R29/R31 |
| data.ts | R44 | R45 | （未实现，由渲染层防御） |
| 渲染层 | （由 data.ts 保证） | （由 data.ts 保证） | R46（tags Array.isArray） |

5. **R44 模式再次确认**："validator 是 CI 守门员，渲染层是 dev 模式守门员"——validator 校验只在 CI 跑，dev 模式下数据错误只能由渲染层捕获。渲染层必须假设"字段可能非预期类型"，做 Array.isArray 防御性检查。

## 文件变更

- `src/components/ProjectCard.astro`：第 38 行 tags 检查改为 `Array.isArray(project.tags) && ...`。
- `src/pages/project/[slug].astro`：第 107 行 tags 检查改为 `Array.isArray(project.tags) && ...`。
- `iterations/README.md`：新增 R46 条目 + R46 列到 6 子目标演进表。
- `iterations/46-tags-field-rendering-layer-array-isarray-defense.md`：本文件。
