# R30：README 数据校验描述同步 R21-R29

> 类型：Connection gap（文档 ↔ 实现）
> 触发：R29 后三类审计发现 README "数据校验"描述滞后于 validator 实现
> 子目标影响：6. 可扩展性（文档与实现一致性）

## 背景

R21 的主题是"README 功能描述同步 R13-R20"，证明项目有保持 README 同步的意识。但 R21 之后，R22-R29 又新增了多项校验，README 的"数据校验"行又滞后。

R29 后三类审计（Connection 类型）发现：README 第 89行列出的 validator 校验项清单不完整，缺失 8 项 R21-R29 新增的校验。

## 抓到的 bug

### N1 README "数据校验"描述缺失 8 项校验（Connection gap）

**证据**：

README 第 89 行（R30 修复前）：
```
- **数据校验**：`npm run validate` 检查 YAML 契约（category 引用、slug 文件名一致性与 URL-friendly 格式、必填字段、status/sources 枚举、repo 格式、addedAt 日期、license SPDX canonical、url 冗余）
```

对照 `scripts/validate-data.mjs` 实际校验项，README 缺失：

| 缺失项 | 实现轮次 | validator 位置 |
|--------|---------|---------------|
| slug 唯一性校验 | R1 | 第 133-136 行 `seenSlugs.has(p.slug)` |
| category id 唯一性校验 | R1 | 第 65 行 `seenCatIds.has(c.id)` |
| category id URL-friendly 格式校验 | R11 | 第 77-80 行 `urlFriendlyRe.test(c.id)` |
| tags 字段类型校验 | R27 | 第 204-214 行 `Array.isArray(p.tags)` |
| url 格式校验 | R28 | 第 160-170 行 `new URL(p.url)` |
| license 字段类型校验 | R28 | 第 174-178 行 `typeof p.license` |
| language 字段类型校验 | R28 | 第 180-186 行 `typeof p.language` |
| Category 5 字段类型校验 | R29 | 第 59-81 行 `catStringFields` 循环 |

**风险**：贡献者阅读 README 了解 validator 能力时，会以为只有 8 项校验，实际有 16 项。这会导致：
1. 贡献者误以为某些错误不会被 validator 拦截，提交前不自查
2. 维护者审计时以为校验覆盖面比实际小
3. 文档与实现不一致，降低项目专业度

## 修复方案

更新 README 第 89 行"数据校验"描述，补全所有校验项：

```
- **数据校验**：`npm run validate` 检查 YAML 契约（必填字段、Project/Category 全字段类型校验、status/sources 枚举、repo 格式、addedAt 日期、slug 文件名一致性与 URL-friendly 格式与唯一性、category 引用、category id 唯一性与 URL-friendly 格式、license 类型与 SPDX canonical、url 格式与冗余、language 类型、tags 数组类型）
```

**组织方式**：
- 必填字段（基础）
- Project/Category 全字段类型校验（R27/R28/R29 的统一抽象）
- 枚举校验（status/sources）
- 格式校验（repo/addedAt/slug/category id/url/license）
- 唯一性校验（slug/category id）
- 引用校验（category）
- 冗余校验（url 与 repo）

使用"Project/Category 全字段类型校验"抽象描述，避免具体到"12 字段 + 5 字段"，防止未来字段数变化时描述过时。

## MVP 回归

文档变更，不影响构建。仍跑 validate 确认数据无变化：

```
✓ npm run validate（0 错误 0 警告，与 R29 后一致）
```

文档变更无需 build 验证。

## 审计反思

R30 是 R21 模式的 Connection gap——R21 同步了 R13-R20，但 R22-R29 新增校验后 README 又滞后。这验证了"文档同步是持续性 gap"：

- 每次新增 validator 校验（R22-R29），README 的校验清单都可能滞后
- R21 之后没有"每次新增校验同步更新 README"的机制

**扩展教训**：未来每次新增 validator 校验（R31+），必须同步更新 README 的"数据校验"描述。这应该成为 validator 修改的 checklist 项：
1. 修改 `scripts/validate-data.mjs` 添加校验
2. 同步更新 `README.md` 第 89 行"数据校验"描述
3. 同步更新 `CONTRIBUTING.md` 相关字段说明（如有）
4. 创建迭代记录

**Connection gap 模式扩展**（R20/R23/R26/R30）：
- R20/R23/R26：实现层修复后，传播到其他实现层（页面/首页/链接）
- R30：实现层修改后，传播到文档层（README）
- 教训：Connection gap 不仅存在于实现层之间，也存在于实现层 ↔ 文档层之间

至此，README "数据校验"描述已与 validator 实现完全对齐，覆盖全部 16 项校验。
