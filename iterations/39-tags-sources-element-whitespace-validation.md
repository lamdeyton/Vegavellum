# R39：tags/sources 元素空白字符串校验（R37 同型遗漏补全）

## 触发

R38 后三类审计（horizontal audit：字段定义 ↔ 使用对齐）发现 R37 的同型遗漏：

R37 给字段级（name/description/license/language + Category id/name/name_en/icon/description）加了 `trim() === ''` 空白字符串校验，但**元素级**（tags/sources 数组元素）遗漏。

R35 的 tags/sources 元素校验只有 `t === ''` / `s === ''` 空字符串校验，没有 `trim() === ''` 空白字符串校验。

### 攻击样本验证确认 gap

构造攻击样本 `tags: ["   ", "cli"]` 和 `sources: ["   ", "curator-curated"]` 运行 validator：

1. **tags 元素空白字符串（CRITICAL）**：`tags: ["   ", "cli"]` 完全静默通过（validator 对 tags 报 0 错误），会渲染为 `#   ` 不可见但占空间的标签。
2. **sources 元素空白字符串（CRITICAL）**：`sources: ["   ", "curator-curated"]` 报误导性 `sources 值 "   " 不在枚举 {auto-discovered, community-nominated, curator-curated} 内`——真实问题是"空白字符串"而非"不在枚举内"（R31 模式：类型/空性错误被枚举校验掩盖）。

## 修复方案

在 R35 的 tags/sources 元素校验中，在 `t === ''` / `s === ''` 空字符串校验后、唯一性校验前，加 `t.trim() === ''` / `s.trim() === ''` 空白字符串校验，`continue` 跳过后续校验。

### 关键设计：sources 的 continue 位置

sources 元素的空白字符串校验必须在**枚举校验之前** `continue`，否则空白字符串会被枚举校验报误导性"不在枚举内"（R31 模式：类型/空性错误优先于枚举校验）。

```javascript
// R39：元素空白字符串校验（同 R37 字段级 trim() 空白校验同型对齐）
if (s.trim() === '') {
  fail(`${label}: sources 元素 "${s}" 为空白字符串（仅含空格/制表符/换行），请填写有效来源`);
  continue; // 跳过枚举校验，避免误导性"不在枚举内"
}
```

## 关键代码变更

`scripts/validate-data.mjs`：

```javascript
// tags 元素校验
const seenTags = new Set();
for (const t of p.tags) {
  if (typeof t !== 'string') { /* ... */ continue; }
  if (t === '') { /* ... */ continue; }
  // R39：元素空白字符串校验
  if (t.trim() === '') {
    fail(`${label}: tags 元素 "${t}" 为空白字符串（仅含空格/制表符/换行），请填写有效标签`);
    continue;
  }
  if (seenTags.has(t)) { /* ... */ continue; }
  seenTags.add(t);
}

// sources 元素校验
const seenSources = new Set();
for (const s of p.sources) {
  if (typeof s !== 'string') { /* ... */ continue; }
  if (s === '') { /* ... */ continue; }
  // R39：元素空白字符串校验（必须在枚举校验之前 continue）
  if (s.trim() === '') {
    fail(`${label}: sources 元素 "${s}" 为空白字符串（仅含空格/制表符/换行），请填写有效来源`);
    continue;
  }
  if (seenSources.has(s)) { /* ... */ continue; }
  seenSources.add(s);
  if (!validSources.has(s)) { /* 枚举校验 */ }
}
```

## 验证

- `npm run validate`：0 错误 0 警告（真实数据不受影响）
- `npm run build`：16 页全部生成
- R39 攻击样本验证（3 个用例）：
  1. ✓ tags 元素空白字符串校验
  2. ✓ sources 元素空白字符串校验（防误导性"不在枚举内"）
  3. ✓ tags + sources 混合空白字符串攻击（3 个错误全部捕获）

## 经验教训

1. **R37 同型对齐遗漏（再次）**：R37 给字段级加了 `trim() === ''` 空白校验，但元素级遗漏。这是 R36→R37 同型对齐模式的再次重演——R36 给 Project 加了 null 防御，R37 补全 Category；R37 给字段级加了 trim() 空白校验，R39 补全元素级。教训：**同型对齐必须覆盖所有层级**——对象级（R36/R37）、字段级（R37）、元素级（R39）。
2. **R31 模式的再次确认**：sources 元素空白字符串被枚举校验报误导性"不在枚举内"。这与 R31 的"数组类型错误被枚举校验掩盖"同型。教训：**类型/空性校验必须在枚举校验之前**，且 `continue` 跳过枚举校验，避免误导性错误信息。
3. **R37 攻击样本验证的价值**：R37 攻击样本验证暴露了 R38 gap，R38 后的审计再次通过攻击样本验证确认 R39 gap。教训：**攻击样本验证是发现同型遗漏的有效工具**——构造边界值（空字符串/空白字符串/非对象/类型错误）运行 validator，观察错误信息是否准确。
