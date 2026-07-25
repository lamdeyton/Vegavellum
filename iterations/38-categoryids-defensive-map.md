# R38：categoryIds 防御性计算（R37 横向 gap 修复）

## 触发

R37 攻击样本验证发现 R37 修复不完整（CRITICAL）：

R37 在 `for (const c of categories)` 循环开头加了 null/非对象防御性检查，但漏掉了循环**之前**的第 66 行：

```javascript
const categoryIds = new Set(categories.map((c) => c.id));  // ← 此处崩溃
```

当 `categories.yaml` 中存在 `- null` 时，`.map((c) => c.id)` 对 null 元素访问 `.id` 抛 `TypeError: Cannot read properties of null (reading 'id')`，validator 在到达 R37 防御性检查**之前**就崩溃了。

**这是典型的横向审计 gap**：R37 修复了一处"遍历 categories + 访问字段"的代码路径（for 循环内），但漏掉了另一处同型代码路径（循环前的 .map 预处理）。

## 修复方案

在 `.map((c) => c.id)` 前加 `.filter()` 过滤掉非对象元素：

```javascript
// R38：categoryIds 防御性计算（CRITICAL，横向审计 gap 修复）
// R37 修复了 `for (const c of categories)` 循环内的 null 崩溃，但漏掉循环**之前**的
// `categories.map((c) => c.id)`——`- null` 仍在此处崩溃（TypeError: Cannot read properties of null）。
// 同型对齐 R36 Project 防御模式：在元素级访问前，对单个元素做防御性 typeof 检查。
// 注意：此处**不**过滤 categories 数组（否则 R37 循环内的报错会失效），
// 只对 categoryIds 计算做 null-safe 处理——非对象元素不贡献 id，但报错仍由 R37 负责。
const categoryIds = new Set(
  categories
    .filter((c) => c !== null && c !== undefined && typeof c === 'object' && !Array.isArray(c))
    .map((c) => c.id)
);
```

### 设计权衡

- **不**在加载阶段过滤 `categories` 数组本身——否则 R37 循环内的"分类条目为空或仅含注释"和"分类条目必须是对象"报错会失效（用户看不到为什么数据被拒绝）。
- **只**对 `categoryIds` 计算做 null-safe 处理——非对象元素不贡献 id（id 必然不存在），但报错由 R37 循环内的检查负责。
- 这样既避免了崩溃，又保留了 R37 的报错能力。

## 验证

- `npm run validate`：0 错误 0 警告（真实数据不受影响）
- `npm run build`：16 页全部生成
- R37 攻击样本验证重跑：5 类 R37 校验 + R38 修复全部通过

  ```
  === R37 攻击样本验证结果 ===
  ✓ Category 空条目/非对象/空白字符串校验
  ✓ Project free-text 空白字符串 + repo 前后空格校验
  ✓ 全部通过
  ```

## 经验教训

1. **横向审计必须覆盖所有同型访问路径**：R37 修复了"for 循环内"的 null 崩溃，但漏掉了"for 循环前的 .map 预处理"的同型崩溃。修复一处防御性检查时，必须审计**所有"遍历该数组 + 访问字段"的代码路径**，包括：
   - 循环内访问（for / forEach / for...of）
   - 循环前预处理（.map / .filter / .reduce）
   - 循环后聚合（.find / .some / .every）
2. **修复 → 验证 → 修复**：R37 的修复在"代码 review"层面看起来正确（循环内有 null 检查），但只有攻击样本验证才暴露了循环前的崩溃。教训：**任何防御性修复都必须配套攻击样本验证**，否则修复可能不完整。
3. **filter 不报错，只过滤；报错由专门检查负责**：避免在预处理阶段既过滤又报错，导致错误信息和实际数据状态不一致。职责分离：filter 只做 null-safe 处理，专门的 for 循环负责报告为什么数据无效。
