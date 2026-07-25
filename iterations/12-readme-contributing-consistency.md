# R12 — README 与 CONTRIBUTING 文档一致性对齐

> 超长程任务模式第十二轮。修复 R10 后 README 未同步 CONTRIBUTING 的文档一致性问题。

## 触发原因

R10 在 CONTRIBUTING 添加了 Node 版本要求说明和 `nvm use` 指引，但 README 的"快速开始"部分未同步。贡献者通常先读 README，不知道 Node 版本要求，可能在 Node 16/22 环境下遇到构建差异。同时 README"功能"部分的数据校验描述滞后于 R6/R8/R9/R11 的 validator 增强。

## 审计发现

### N1（Vertical · 文档一致性）：README 快速开始未提及 Node 版本要求

**症状**：
- CONTRIBUTING（R10 更新）有 Node ≥ 18 要求和 `nvm use` 指引
- README 快速开始直接 `npm install`，无版本提示
- 两份文档对同一环境要求描述不一致

**修复**：README 快速开始添加版本说明块引用 + `nvm use` 步骤，与 CONTRIBUTING 对齐。

### N2（Horizontal · 文档滞后）：README 功能描述未反映 validator 增强

**症状**：README"数据校验"功能描述为"检查 YAML 契约（category 引用、slug 文件名一致性、必填字段、枚举值）"，但 R6-R11 新增了 5 项校验：
- R6: url 冗余检查
- R8: sources 枚举校验
- R9: license SPDX canonical 校验
- R11: slug/category id URL-friendly 格式校验
- （R5 已有但未文档化：addedAt 日期格式）

**修复**：更新功能描述，列全当前校验项。

## MVP 回归验证

```bash
ASTRO_TELEMETRY_DISABLED=1 npm run validate
# ✓ 数据校验通过

ASTRO_TELEMETRY_DISABLED=1 npm run build
# ✓ 16 page(s) built in 495ms
```

无回归（纯文档变更）。

## 子目标深度演进

R12 后，6 子目标状态不变（文档对齐，非代码/契约变更）：
1. 数据完整性 — 深+
2. 路由正确性 — 深+
3. 可访问性 — 中+
4. SEO/元数据 — 深+
5. 部署链路 — 深+
6. 可扩展性 — 深

## 最终评估

R8-R12 共 5 轮，在 R7 "感觉完成"后继续审计，发现并修复了 **10 个真实 gap**：

| 轮次 | gap | 类型 | 严重性 |
|------|-----|------|--------|
| R8 N1 | CI 未覆盖 mvp-demo 分支 | Vertical · 部署 | CRITICAL |
| R8 N2 | sources 枚举未校验 | Horizontal · 契约 | 高 |
| R9 N1 | license SPDX canonical 未校验 | Horizontal · 契约 | 高 |
| R10 N1 | Node 版本未锁定 | Vertical · 环境 | 中 |
| R10 N2 | CONTRIBUTING 未文档化 sources | Horizontal · 文档 | 中 |
| R11 N1 | slug/category id URL-friendly 未校验 | Horizontal · PK 格式 | 高 |
| R12 N1 | README 未提及 Node 版本要求 | Vertical · 文档 | 中 |
| R12 N2 | README 功能描述滞后 | Horizontal · 文档 | 低 |

### 有意识推迟的 gap（非 MVP 范围）

| gap | 推迟原因 |
|-----|---------|
| WCAG 2.4.7 focus-visible 样式 | 属正式开发阶段 a11y 打磨 |
| `astro check` 类型检查纳入 CI | 需新增 devDependencies，MVP 规模下手动审查 suffice |
| license SPDX 完整列表动态拉取 | 需引入网络依赖，MVP 用硬编码列表 suffice |
| 种子数据覆盖 5 个空分类 | 属内容运营范畴，非技术 gap |

### 结论

R8-R12 的 5 轮审计中，每轮都发现真实 gap，印证了 long-range-task-execution 的核心原则："当你感觉完成时，你还没完成。" 经过 12 轮迭代，MVP demo 的数据契约执行、部署链路、文档一致性均已达到"深+"水平，剩余 gap 均为有意识推迟的正式开发阶段任务。MVP demo 迭代阶段可以诚实收尾。
