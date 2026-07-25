# R19 · sources 字段用户友好显示

> 轮次类型：Horizontal（同文件字段↔使用对齐）
> 触发：R18 后审计发现 — sources 字段在 CONTRIBUTING 声明为 3 枚举值（`auto-discovered` / `community-nominated` / `curator-curated`），但 [slug].astro 直接 `sources.join(', ')` 渲染原始英文枚举，普通中文用户看到 `curator-curated` 无法理解。

## 审计发现

### N1（Horizontal · 字段使用层）：sources 字段显示为原始枚举值

**症状**：

- `data.ts` 定义 `sources?: string[]`，注释为"收录来源，自动维护字段"
- `CONTRIBUTING.md` 声明 sources 为 3 个枚举值之一
- `validate-data.mjs` R8 已强制枚举校验
- 但 `src/pages/project/[slug].astro` 第 102 行直接：
  ```astro
  <dd>{sources.join(', ')}</dd>
  ```
- 用户在项目详情页看到："收录来源：curator-curated"
- 这是**技术性英文枚举**，违背项目定位（"面向普通中文用户"的精选目录站）

**根本原因**：

字段定义（data.ts + CONTRIBUTING）↔ 字段使用（[slug].astro 渲染）未对齐。枚举值是数据契约层的标识符，不应当直接展示给最终用户。

**修复方案**：

1. 在 `src/lib/data.ts` 新增 `SOURCE_LABELS` 常量映射：枚举值 → 用户友好中文标签
2. 导出 `getSourceLabel(s: string): string` 工具函数（未知值回退到原值，避免未来扩展新枚举时静默破坏）
3. 在 `[slug].astro` 中使用映射转换

## 实施变更

### 1. `src/lib/data.ts` — 添加 SOURCE_LABELS 映射 + getSourceLabel 函数

```typescript
/** sources 枚举值到用户友好中文标签的映射 */
export const SOURCE_LABELS: Record<string, string> = {
  'auto-discovered': '机器人自动发现',
  'community-nominated': '社区 PR 提名',
  'curator-curated': '维护者人工策展',
};

/** 将 sources 枚举值转换为用户友好中文标签，未知值回退到原值。 */
export function getSourceLabel(s: string): string {
  return SOURCE_LABELS[s] ?? s;
}
```

### 2. `src/pages/project/[slug].astro` — 使用映射渲染

```astro
---
import { getSourceLabel } from '../../lib/data';
// ...
---
<dd>{sources.map((s) => getSourceLabel(s)).join('、')}</dd>
```

- 中文分隔符改为顿号「、」符合中文排版
- 未知枚举值回退到原值，未来扩展不静默破坏（与 validator fail 形成双重保险）

## 验证

- `npm run validate` 通过
- `ASTRO_TELEMETRY_DISABLED=1 npm run build` 通过
- 构建产物 `dist/project/nextjs/index.html` 检查：sources 显示为"维护者人工策展"，不再为 `curator-curated`

## 6 子目标深度演进

| 子目标 | R18 | R19 |
|--------|-----|-----|
| 1. 数据完整性 | 深+ | 深+ |
| 2. 路由正确性 | 深+ | 深+ |
| 3. 可访问性 | 深 | 深 |
| 4. SEO/元数据 | 深+ | 深+ |
| 5. 部署链路 | 深+ | 深+ |
| 6. 可扩展性 | 深 | 深+（SOURCE_LABELS 单点扩展，未知值回退保护） |

## 教训

**字段定义↔使用对齐不止于"是否使用"，还包括"使用方式是否尊重字段语义"**：

- R14 修复了 `url` 字段在卡片层未渲染（字段未使用）
- R19 修复了 `sources` 字段渲染了原始枚举值（字段使用了但语义不当）

横向审计应同时检查：**字段是否被使用 + 字段是否按语义正确使用**。
