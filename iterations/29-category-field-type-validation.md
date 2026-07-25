# R29：Category 字段类型校验

> 类型：声明但未执行的契约（同 R6/R8/R9/R11/R27/R28 模式，扩展补全）
> 触发：R28 后水平审计发现 Category interface 字段类型校验缺失
> 子目标影响：1. 数据完整性

## 背景

R27/R28 完成了 Project interface 全部 12 字段的类型/格式校验。水平审计扩展到 `Category` interface（`src/lib/data.ts` 第 10-16 行），发现 5 个字段均声明为 `string` 但 validator 未校验 `typeof`：

```typescript
export interface Category {
  id: string;
  name: string;
  name_en: string;
  icon: string;
  description: string;
}
```

validator 此前对 Category 仅校验：
- 必填字段存在性（`if (!c.name) fail(...)`）
- id 重复、id URL-friendly 格式

**未校验类型**。贡献者误写为数组/对象时，`if (!c.name)` 对非空数组为 falsy 通过，进入渲染层导致异常。

## 抓到的 bug

### N1 Category 5 个字段类型未校验（渲染异常）

**证据**：
- `data/categories.yaml` 第 1-5 行：5 个字段都声明为字符串标量
- `src/components/CategoryList.astro` 第 22-23 行：`<span class="name-cn">{c.name}</span>` / `<span class="name-en" lang="en">{c.name_en}</span>`
- `src/pages/category/[id].astro`：使用 `c.description` 作为页面标题/描述
- `src/pages/index.astro`：使用 `c.icon` / `c.name` / `c.name_en` 在分类卡渲染

**风险场景**：贡献者误写 `name: [前端, 框架]`（数组）：
- `<span>{c.name}</span>` 渲染为 "前端,框架"
- 必填校验 `if (!c.name)` 对非空数组 `[前端, 框架]` 为 truthy 通过
- 不破坏构建，但渲染异常（与 R28 language 字段同型问题）

**字段对照**：

| 字段 | TypeScript 类型 | R29 前校验 | 误写后果 |
|------|----------------|-----------|---------|
| id | string | 必填 + URL-friendly ✓ | `id: [frontend, framework]` → 数组，URL 生成异常 |
| name | string | 仅必填 ✓ | `name: [前端, 框架]` → 渲染为 "前端,框架" |
| name_en | string | 仅必填 ✓ | `name_en: [Frontend, Framework]` → 渲染为 "Frontend,Framework" |
| icon | string | 仅必填 ✓ | `icon: [🎨, ✨]` → 渲染为 "🎨,✨" |
| description | string | 仅必填 ✓ | `description: [构建, 框架]` → 渲染为 "构建,框架" |

## 修复方案

在 `scripts/validate-data.mjs` 分类定义校验区，对 5 个字段执行 `typeof` 字符串校验：

```javascript
// Category interface 字段类型校验（src/lib/data.ts 声明，与 Project interface 同型）
// 必填字段：id/name/name_en/icon/description 都必须是字符串
const catStringFields = ['id', 'name', 'name_en', 'icon', 'description'];
for (const c of categories) {
  // 必填字段存在性
  if (!c.id) fail(`分类缺少 id 字段: ${JSON.stringify(c)}`);
  if (seenCatIds.has(c.id)) fail(`分类 id 重复: ${c.id}`);
  seenCatIds.add(c.id);
  if (!c.name) fail(`分类 ${c.id} 缺少 name`);
  if (!c.name_en) fail(`分类 ${c.id} 缺少 name_en`);
  if (!c.icon) fail(`分类 ${c.id} 缺少 icon`);
  if (!c.description) fail(`分类 ${c.id} 缺少 description`);
  // 字段类型校验（防止误写为数组/对象，渲染异常）
  for (const f of catStringFields) {
    if (c[f] !== undefined && typeof c[f] !== 'string') {
      fail(`分类 ${c.id}: ${f} 必须是字符串，当前类型为 ${typeof c[f]}`);
    }
  }
  // category id 用于 URL（/category/<id>），必须 URL-friendly
  if (c.id && !urlFriendlyRe.test(c.id)) {
    fail(`分类 id "${c.id}" 不是 URL-friendly 格式（仅小写字母/数字/连字符，无首尾/连续连字符）`);
  }
}
```

同步更新文件头注释，新增"Category interface 字段类型校验"说明。

**类型校验与必填校验的顺序**：必填校验在前（`if (!c.name)` 拦截空值），类型校验在后（拦截非空但错误类型）。两者互补：必填校验不拦截非空数组，类型校验不拦截空字符串。两者都执行，覆盖完整。

## MVP 回归

### 正向验证（现有数据）
```
✓ npm run validate（0 错误 0 警告）
✓ npm run build（16 页面构建完成）
```

### 负向验证（临时修改 categories.yaml）

备份 `data/categories.yaml`，将 `frontend-framework` 分类的 `name` 改为数组：

```yaml
- id: frontend-framework
  name: [前端, 框架]
  name_en: Frontend Framework
```

运行 `node scripts/validate-data.mjs`：

```
▸ 分类定义
  ✗ 分类 frontend-framework: name 必须是字符串，当前类型为 object

────────────────────────
  错误：1
  警告：0
────────────────────────

✗ 数据校验失败，请修复上述错误。
exit=1
```

**结论**：validator 成功拦截 name 数组误写，exit 1。恢复 categories.yaml 后重新 validate 通过（0 错误 0 警告）。

## 审计反思

R29 是 R27/R28 模式的自然扩展——R27/R28 完成了 Project interface 全部 12 字段的类型校验后，水平审计扩展到 Category interface，发现 5 个字段全部缺失类型校验。

**扩展教训**：TypeScript interface 契约校验应覆盖**所有 interface**，不仅是 Project。每声明一个 interface，其字段都应在 validator 中执行 typeof/Array.isArray 校验。Category 与 Project 同型（都是数据契约 interface），同型应同处理。

**Connection gap 模式提醒**：R29 完成后，需要审计是否还有其他"对外声明层"（TypeScript interface）与"内部使用层"（validator）不一致的接口。例如：是否还有未在 validator 中校验的 interface 字段？是否有页面/组件使用了 interface 未声明的字段？

至此，Category interface 全部 5 个字段的类型/格式校验已完整覆盖：

| 字段 | 类型 | 校验 |
|------|------|------|
| id | string | 必填 ✓ + URL-friendly ✓ + 类型 ✓（R29） |
| name | string | 必填 ✓ + 类型 ✓（R29） |
| name_en | string | 必填 ✓ + 类型 ✓（R29） |
| icon | string | 必填 ✓ + 类型 ✓（R29） |
| description | string | 必填 ✓ + 类型 ✓（R29） |
