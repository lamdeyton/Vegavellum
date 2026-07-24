# Vegavellum 迭代记录

> 超长程任务模式的逐轮过程记录。每轮必须产出：可执行产物 + 真实 bug/gap + MVP 回归验证。

## 判断标准

一轮迭代是"真实的"当且仅当三条件全满足：
1. **触发是外部压力** — 真实摩擦，非"我感觉缺功能"
2. **产物可执行** — 代码变更 + 通过的验证 + 抓到 bug
3. **完成信号可证伪** — 写不出验证方式的，是想象需求

## 审计方法（感觉"做完了"时强制执行）

| 类型 | 检查内容 |
|------|---------|
| Vertical（跨文件） | 数据 ↔ 页面 ↔ 组件 之间契约一致性 |
| Horizontal（同文件） | 字段定义 ↔ 使用 是否对齐 |
| Connection（传播） | schema 变更是否传播到所有层 |

## 轮次索引

| 轮次 | 主题 | 状态 | 抓到的 bug |
|------|------|------|-----------|
| [R1](./01-data-contract-path-consistency.md) | 数据契约 + 路径一致性 | 已完成 | B1-B5（base 双斜杠 / sources 契约 / category 引用 / slug 文件名 / pending 静默）+ E1 校验脚本命名冲突 + E2 Astro 遥测 EPERM |
| [R2](./02-seo-completeness.md) | SEO 完整性 | 已完成 | E1 @astrojs/sitemap@3.7.3 与 Astro 4 不兼容 + E2 Astro 7 升级破坏性变更 |
| [R3](./03-ux-completeness.md) | 用户体验完善 | 已完成 | 无新 bug（补全 404 / 统计 / 空分类 CTA / CONTRIBUTING / LICENSE） |
| [R4](./04-final-audit.md) | 最终审计 + 6 子目标全验证 | 已完成 | N1 canonical URL 尾斜杠与 sitemap 不一致 + N2 README 未反映 R1-R3 + N3 iterations 索引未更新 |
| [R5](./05-404-canonical-noindex.md) | 404 canonical 修复 + 契约执行补强 | 已完成 | N1 404 canonical 指向不存在的 URL（CRITICAL）+ N2 addedAt 格式未校验 + N3 license SPDX 大小写不规范 |

## 6 子目标深度演进

| 子目标 | R1 后 | R2 后 | R3 后 | R4 后 | R5 后 |
|--------|-------|-------|-------|-------|-------|
| 1. 数据完整性 | 深 | 深 | 深 | 深 | 深+ |
| 2. 路由正确性 | 深 | 深 | 深 | 深 | 深 |
| 3. 可访问性 | 未涉及 | 未涉及 | 中 | 中 | 中 |
| 4. SEO/元数据 | 未涉及 | 深 | 深 | 深 | 深+ |
| 5. 部署链路 | 深 | 深 | 深 | 深 | 深 |
| 6. 可扩展性 | 未涉及 | 未涉及 | 深 | 深 | 深 |

> 子目标 3（可访问性）当前为"中"：已含 404 页面、空状态 CTA、aria-label。继续做深需 a11y 审计（对比度、键盘导航、skip-link），不在 MVP demo 范围内，留作正式开发阶段任务。
