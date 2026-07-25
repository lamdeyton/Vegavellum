# R27：tags 字段类型校验

> 类型：声明但未执行的契约（同 R6/R8/R9/R11 模式）
> 触发：R26 后三类审计发现
> 子目标影响：1. 数据完整性

## 背景

R26 后做水平审计时发现：`Project` interface 声明 `tags?: string[]`（字符串数组），但 validator 未校验 tags 字段的类型。同型字段 `sources?: string[]` 已在 R8 添加了 `Array.isArray` 校验，但 tags 字段被遗漏。

## 抓到的 bug

### N1 tags 字段未校验为数组类型（构建破坏风险）

**证据**：

1. `src/lib/data.ts` 第 27 行：`tags?: string[];` — TypeScript 声明为字符串数组
2. `src/components/ProjectCard.astro` 第 38-42 行：
   ```astro
   {project.tags && project.tags.length > 0 && (
     <ul class="tags">
       {project.tags.map((t) => <li>#{t}</li>)}
     </ul>
   )}
   ```
3. `src/pages/project/[slug].astro` 第 107-114 行：同样调用 `project.tags.map(...)`

**风险场景**：贡献者误写 `tags: cli`（字符串）而非 `tags: [cli]`（数组）：
- YAML 解析 `tags: cli` 为字符串 `"cli"`
- `project.tags` 是 truthy ✓
- `project.tags.length > 0` 是 true（字符串 length 是 3）✓
- `project.tags.map(...)` —— **字符串没有 map 方法**，TypeError，构建失败

**为什么是真实 gap**：
1. CONTRIBUTING.md 通过示例 `tags: [cli, rust, search]` 隐式声明 tags 是数组
2. Project interface 显式标注 `tags?: string[]`
3. validator 校验了同型的 sources 字段（`Array.isArray`），未校验 tags 字段——不一致处理
4. 现有 5 个项目文件恰好都用了数组形式，所以未触发；但贡献者误写时无校验拦截，会直接破坏构建

## 修复方案

在 `scripts/validate-data.mjs` 中添加 tags 字段类型校验（与 sources 字段校验同型）：

```javascript
// tags 字段类型校验（Project interface 契约：tags?: string[]）
// 贡献者可能误写 `tags: cli`（字符串）而非 `tags: [cli]`（数组），
// 未校验会导致 ProjectCard / project 详情页构建时 project.tags.map() 报 TypeError
if (p.tags !== undefined) {
  if (!Array.isArray(p.tags)) {
    fail(`${label}: tags 必须是数组，当前类型为 ${typeof p.tags}（应使用 YAML 数组语法，如 [cli, rust]）`);
  } else {
    for (const t of p.tags) {
      if (typeof t !== 'string') {
        fail(`${label}: tags 元素 "${String(t)}" 必须是字符串，当前类型为 ${typeof t}`);
      }
    }
  }
}
```

同步更新文件头注释，声明新增校验项。

## MVP 回归

### 正向验证（现有数据）
```
✓ npm run validate（0 错误 0 警告）
✓ npm run build（16 页面构建完成）
```

### 负向验证（临时测试文件）

创建 `data/projects/negative-test-r27.yaml`，故意写 `tags: cli`（字符串而非数组）：

```yaml
name: Negative Test
slug: negative-test-r27
repo: owner/negative-test
description: 临时负向测试文件，验证 tags 字段类型校验
category: dev-tools
tags: cli
language: Test
addedAt: 2026-07-25
status: pending
sources: [community-nominated]
```

运行 `npm run validate`：

```
▸ 项目数据
  ✗ negative-test-r27.yaml: tags 必须是数组，当前类型为 string（应使用 YAML 数组语法，如 [cli, rust]）
  ⚠ negative-test-r27.yaml: status=pending，该项目不会在站点上显示，等待维护者审核

────────────────────────
  错误：1
  警告：1
────────────────────────

✗ 数据校验失败，请修复上述错误。
exit=1
```

**结论**：validator 正确拦截 tags 字符串误写，exit 1，符合预期。删除临时文件后重新 validate 通过。

## 审计反思

这一轮再次出现 R6/R8/R9/R11 的"声明但未执行契约"模式：

- R6：CONTRIBUTING 声明 url 应省略与 repo 重复 → validator 未校验
- R8：CONTRIBUTING 声明 sources 枚举 → validator 未校验
- R9：CONTRIBUTING 声明 license SPDX canonical → validator 未校验
- R11：CONTRIBUTING 声明 slug URL-friendly → validator 未校验
- **R27：Project interface 声明 tags?: string[] → validator 未校验**

但 R27 有一个新特征：这次不是 CONTRIBUTING 声明未执行，而是 **TypeScript interface 声明未执行**。教训扩展：

> **每声明一条契约（无论在 CONTRIBUTING、设计方案、还是 TypeScript interface），必须同步加 validator 校验。TypeScript interface 是编译时契约，运行时 YAML 解析无类型保护，validator 是唯一防线。**

同时这次也发现了一个"同型字段不一致处理"的子模式：
- `sources?: string[]` 在 R8 校验了 `Array.isArray`
- `tags?: string[]` 在 R27 之前未校验 `Array.isArray`
- 同型字段（都是字符串数组）应使用同型校验逻辑

未来若新增字符串数组字段（如 `maintainers?: string[]`），应同步加 `Array.isArray` 校验。
