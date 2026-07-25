# R40：repo 中间空格校验（R37 前后空格校验同型补全）

## 触发

R39 后三类审计（horizontal audit：字段定义 ↔ 使用 对齐）发现 R37 的同型遗漏：

R37 给 repo 加了前后空格校验（`p.repo !== p.repo.trim()`），但**没有校验中间空格**。

### 攻击样本验证确认 gap

构造攻击样本 `repo: "with astro/astro"` 运行 validator：完全静默通过（0 错误 0 警告）。

分析：
- `"with astro/astro".split('/')` = `["with astro", "astro"]`，length = 2，通过格式校验
- `"with astro/astro" === "with astro/astro".trim()` = true，通过 R37 前后空格校验
- 但 GitHub owner/repo 不允许任何空格，URL `https://github.com/with astro/astro` 含空格 404

## 修复方案

在 R37 前后空格校验后，加 R40 中间空格校验。关键设计：加 `p.repo === p.repo.trim()` 条件避免与 R37 冗余。

```javascript
// R40：repo 中间空格校验（R37 前后空格校验的同型补全）
// 条件 `p.repo === p.repo.trim()` 避免与 R37 冗余：
// - 前后空格由 R37 报（提供 trim 修正值）
// - 中间空格由 R40 报（无法自动修正，提示检查拼写）
if (typeof p.repo === 'string' && p.repo && p.repo === p.repo.trim() && /\s/.test(p.repo)) {
  fail(`${label}: repo "${p.repo}" 含中间空格（owner/repo 不允许空格），请检查拼写`);
}
```

### 设计权衡：为什么用 `p.repo === p.repo.trim()` 条件？

- repo 有前后空格（`" withastro/astro "`）→ R37 报"前后空格，应为 withastro/astro"，R40 不执行（`p.repo !== p.repo.trim()`）
- repo 有中间空格但无前后空格（`"with astro/astro"`）→ R37 不执行，R40 报"中间空格"
- repo 既有前后空格又有中间空格（`" with astro/astro "`）→ R37 报"前后空格，应为 with astro/astro"，R40 不执行。贡献者 trim 后得到 `"with astro/astro"`，再次运行 validator，R37 不执行（已 trim），R40 报"中间空格"。这是合理的两步反馈。

## 验证

- `npm run validate`：0 错误 0 警告（真实数据不受影响）
- `npm run build`：16 页全部生成
- R40 攻击样本验证（4 个用例）：
  1. ✓ owner 含中间空格（`with astro/astro`）
  2. ✓ repo 名含中间空格（`withastro/astro build`）
  3. ✓ 前后空格由 R37 负责，不报"中间空格"（避免冗余错误）
  4. ✓ 正常 repo（`withastro/astro`）通过校验

## 经验教训

1. **R37 同型遗漏（第三次）**：R37 只校验前后空格（`p.repo !== p.repo.trim()`），遗漏中间空格。这是 R36→R37→R39→R40 同型对齐模式的再次重演：
   - R36→R37：对象级同型对齐（Project → Category）
   - R37→R39：层级同型对齐（字段级 → 元素级）
   - R37→R40：场景同型对齐（前后空格 → 中间空格）
   
   教训：**空格校验必须覆盖所有场景**——前后空格（可 trim 修正）+ 中间空格（无法自动修正）。`p.repo !== p.repo.trim()` 只检查前后空格，`/\s/.test(p.repo)` 检查所有空格。两者结合提供完整的空格校验。

2. **错误信息精确性**：R37 前后空格报"应为 X"（提供 trim 修正值），R40 中间空格报"请检查拼写"（无法自动修正）。错误信息的精确性影响贡献者的修复效率——能自动修正的提供修正值，不能自动修正的提示检查方向。

3. **冗余错误避免**：R40 加 `p.repo === p.repo.trim()` 条件，避免与 R37 产生冗余错误。如果 repo 同时有前后空格和中间空格，R37 先报"前后空格"（提供 trim 修正值），贡献者 trim 后再运行 validator，R40 报"中间空格"。这是"分步反馈"模式——避免一次性报告多个错误让贡献者困惑，而是按严重性/可修正性分步报告。
