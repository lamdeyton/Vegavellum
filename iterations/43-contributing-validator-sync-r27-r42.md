# R43：CONTRIBUTING.md 本地验证描述同步 R27-R42（Connection gap 修复）

## 触发（外部压力）

R42 完成装饰性 emoji aria-hidden 同型对齐后，进入 R43 三类审计。Vertical/Horizontal 审计未发现 gap（validator 健壮性已达十二层闭环，a11y 同型对齐已完成）。Connection 审计发现文档层滞后：

- **README.md 第 89 行**：已详细列出 R1-R41 全部 12 层校验闭环 ✓
- **CONTRIBUTING.md 第 65 行**：仍停留在 R1 时代描述"检查必填字段、category 引用、slug 文件名一致性等"，未同步 R27-R42 新增的全字段类型校验/未知字段拒绝/空值校验/空白字符串/repo 空格/categories 顶层防御等 ❌

这是与 R12/R21/R30 同型的 Connection gap：实现层（validator）持续增强，文档层（CONTRIBUTING）滞后。贡献者读 CONTRIBUTING 时无法了解 validator 的真实严格程度，可能误以为只需检查 3 项，提交 PR 后被大量校验拦截。

## Gap 描述

**修复前 CONTRIBUTING.md 第 65 行**：

```bash
# 数据校验（检查必填字段、category 引用、slug 文件名一致性等）
npm run validate
```

"等"字暗示还有更多，但描述确实滞后于 R27-R42 的实际实现。贡献者无法从描述中预知 validator 会校验：

- R27-R31：Project/Category 全字段类型校验（防数组/对象误写）
- R33：未知字段拒绝（防 `lisense`/`tagz` 等 typo 静默通过）
- R34：addedAt 日期有效性 + repo 跨项目唯一性
- R35：tags/sources 数组元素类型/非空/唯一性
- R36-R37：可选字段空值校验 + free-text 空白字符串校验
- R37/R40：repo 前后空格 + 中间空格校验
- R38：categoryIds 防御性计算
- R41：categories.yaml 顶层 null/非数组防御

**对比 README.md 第 89 行**（已同步到 R41）：

```
- **数据校验**：`npm run validate` 检查 YAML 契约（必填字段、Project/Category 全字段类型校验、status/sources 枚举、repo 格式与跨项目唯一性、addedAt 日期格式与有效性、slug 文件名一致性与 URL-friendly 格式与唯一性、category 引用、category id 唯一性与 URL-friendly 格式、license 类型与 SPDX canonical、url 格式与冗余、language 类型、tags/sources 数组类型与元素非空/唯一性/空白字符串校验、可选字段空值校验 url/license/language 不得为空字符串且 tags/sources 不得为空数组、未知字段拒绝防 typo、空文件与非对象 YAML 防御性检查防 validator 崩溃、free-text 字段空白字符串校验防渲染不可见内容、repo 前后空格与中间空格校验防 GitHub URL 404、categoryIds 防御性计算防 `- null` 在循环前崩溃、categories.yaml 顶层 null/非数组校验防 `?? []` 掩盖空文件导致 validator 静默通过但渲染层崩溃）
```

## 修复

将 CONTRIBUTING.md 第 65 行的描述更新为与 README.md 第 89 行同步的概览，但保持贡献者友好的注释格式（多行 `#` 注释）。

**修复后 CONTRIBUTING.md 第 65-71 行**：

```bash
# 数据校验（检查必填字段、Project/Category 全字段类型、status/sources 枚举、
# repo 格式与跨项目唯一性、addedAt 日期格式与有效性、slug 文件名一致性与 URL-friendly
# 格式与唯一性、category 引用、category id 唯一性与 URL-friendly 格式、license SPDX
# canonical、url 格式与冗余、tags/sources 数组元素类型/非空/唯一性/空白字符串、
# 可选字段空值、未知字段拒绝防 typo、空文件与非对象 YAML 防御性检查、free-text
# 空白字符串、repo 前后与中间空格、categories.yaml 顶层 null/非数组校验等）
npm run validate
```

**与 README.md 第 89 行的对齐策略**：

- 内容同步：覆盖 R1-R42 全部校验项
- 格式差异：README 用单行（适合功能列表），CONTRIBUTING 用多行 `#` 注释（适合 bash 代码块内可读性）
- 措辞简化：CONTRIBUTING 略微精简（如省略"防 validator 崩溃"等防御性说明的细节），保留"等"字暗示未来可能扩展

## MVP 回归验证

- `npm run validate`：✓ 0 错误 0 警告（5 项目 9 分类）
- `npm run build`：✓ 16 页面构建成功
- 纯文档变更，不影响构建产物

## 教训（Connection gap 模式再次确认）

**文档同步三处对齐模式**：R12/R21/R30 已确立"validator 增强 → 同步 README"模式，但 CONTRIBUTING.md 是同型遗漏：

1. **README.md**（面向用户/访客）：描述站点功能，需同步
2. **CONTRIBUTING.md**（面向贡献者）：描述提交流程和校验规则，需同步
3. **iterations/README.md**（面向维护者）：记录迭代历史，需同步

教训扩展：validator 增强后，必须审计**所有面向不同受众的文档**是否同步，不只是 README。CONTRIBUTING.md 是贡献者唯一参考，描述滞后会直接误导贡献者。

**"等"字不是免责声明**：原描述用"等"字暗示更多校验，但"等"无法让贡献者预知 validator 的真实严格程度。文档同步应明确列出主要校验项，让贡献者提交前能自查。

## 文件变更

- `CONTRIBUTING.md`：第 65 行本地验证描述同步 R27-R42 validator 增强。
- `iterations/README.md`：新增 R43 条目 + Connection gap 模式扩展。
- `iterations/43-contributing-validator-sync-r27-r42.md`：本文件。
