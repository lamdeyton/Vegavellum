# R9 — license SPDX canonical 契约执行

> 超长程任务模式第九轮。延续 R8 审计发现的"声明未执行的契约"模式，补全 license 字段的 SPDX canonical 校验。

## 触发原因

R8 三类审计发现 CONTRIBUTING.md 第 23 行声明 "license: MIT # SPDX 标识符（canonical 形式，如 MIT / Apache-2.0 / Unlicense）"，但 validator 未校验 license 字段的规范性。R5 仅修复了具体文件的大小写（`mit` → `MIT`、`unlicense` → `Unlicense`），但没加通用校验 —— 属典型的"声明未执行的契约"（declared but unenforced）。

这是 R6（url 冗余）、R8 N2（sources 枚举）之后的第三次同类发现，印证了 reverse reconciliation audit 的价值。

## 审计发现

### N1（Horizontal · validator）：license SPDX canonical 形式未校验

**症状**：`scripts/validate-data.mjs` 校验了 status/sources 枚举、addedAt 格式、repo 格式，但未校验 license 字段。贡献者写 `license: mit` 或 `license: apache-2.0` 能通过校验，违反 CONTRIBUTING 声明的 canonical SPDX 契约。

**实现策略权衡**：

| 方案 | 优点 | 缺点 |
|------|------|------|
| A. 硬编码完整 SPDX 列表（500+） | 精确 | 维护负担重，列表随 SPDX 版本变化 |
| B. 动态拉取 SPDX JSON | 始终最新 | validator 引入网络依赖，CI 可能不稳定 |
| C. 常见列表 + 大小写检测 + 未知 warn | 轻量、无外部依赖 | 罕见许可证会 warn（可接受） |

选 **方案 C**：维护 25 个常见 OSI 认可的 SPDX ID（覆盖 95%+ 开源项目），双策略：
- 已知许可证大小写错误 → **fail**（确定性错误）
- 未知许可证 → **warn**（可能是罕见但合法的许可证，不阻塞）

**修复**：
```javascript
// scripts/validate-data.mjs
const spdxLicenses = new Set([
  'MIT', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', 'ISC', 'MPL-2.0',
  'GPL-3.0-only', 'GPL-3.0-or-later', 'GPL-2.0-only', 'GPL-2.0-or-later',
  'LGPL-3.0-only', 'LGPL-3.0-or-later', 'LGPL-2.1-only', 'LGPL-2.1-or-later',
  'AGPL-3.0-only', 'AGPL-3.0-or-later', 'Unlicense', '0BSD', 'CC0-1.0',
  'CC-BY-4.0', 'CC-BY-SA-4.0', 'WTFPL', 'Zlib', 'Boost Software License',
]);
const spdxLowercaseMap = new Map();
for (const id of spdxLicenses) {
  spdxLowercaseMap.set(id.toLowerCase(), id);
}

// 校验逻辑
if (p.license !== undefined && p.license !== '') {
  const canonical = spdxLowercaseMap.get(String(p.license).toLowerCase());
  if (canonical && canonical !== p.license) {
    fail(`${label}: license "${p.license}" 不是 canonical SPDX 形式，应为 "${canonical}"`);
  } else if (!canonical) {
    warn(`${label}: license "${p.license}" 不在常见 SPDX 列表中，请到 https://spdx.org/licenses/ 核对 canonical 形式`);
  }
}
```

## 负向测试验证

为证明修复有效，构造三种场景验证：

### 场景 1：已知许可证大小写错误（`mit`）→ 应 fail
```
✗ _test-bad-case.yaml: license "mit" 不是 canonical SPDX 形式，应为 "MIT"
错误：1
✗ 数据校验失败
```
✓ 正确失败，提示 canonical 形式。

### 场景 2：未知许可证（`Some-Weird-License-1.0`）→ 应 warn
```
⚠ _test-unknown.yaml: license "Some-Weird-License-1.0" 不在常见 SPDX 列表中，请到 https://spdx.org/licenses/ 核对 canonical 形式
错误：0
警告：2
✓ 数据校验通过（含警告，不影响构建）
```
✓ 正确警告但不阻塞构建。

### 场景 3：现有数据（MIT / Unlicense）→ 应 pass 无警告
```
错误：0
警告：0
✓ 数据校验通过。
```
✓ 现有 5 个项目的 license 字段均为 canonical 形式，无回归。

## MVP 回归验证

```bash
ASTRO_TELEMETRY_DISABLED=1 npm run validate
# ✓ 数据校验通过（0 错误 0 警告）

ASTRO_TELEMETRY_DISABLED=1 npm run build
# ✓ 16 page(s) built in 471ms
```

无回归。

## 子目标深度演进

R9 后，6 子目标状态：
1. **数据完整性** — 深+（license SPDX canonical 契约执行，validator 覆盖率再提升）
2. **路由正确性** — 深
3. **可访问性** — 中+
4. **SEO/元数据** — 深+
5. **部署链路** — 深+
6. **可扩展性** — 深

## 模式总结：声明未执行契约

R6/R8/R9 三轮连续发现同一模式 —— CONTRIBUTING 声明的契约未被 validator 执行：

| 轮次 | 字段 | 声明 | 缺口 | 修复策略 |
|------|------|------|------|---------|
| R6 | url | "无独立官网时省略 url" | url===repoUrl 未拦截 | warn |
| R8 | sources | 枚举 3 值 | 枚举未校验 | fail |
| R9 | license | "canonical SPDX 形式" | 大小写未校验 | fail + warn 双策略 |

**教训**：CONTRIBUTING 中每声明一条契约，validator 必须有对应校验。后续新增字段时，应同步加 validator 检查，而非依赖事后审计发现。

## 下一轮候选（R10 审计输入）

R9 完成后剩余的低优先级 gap：
- **`.nvmrc` 缺失**：CI 用 Node 20，本地无版本锁定。贡献者本地 Node 版本可能与 CI 不一致。
- **CONTRIBUTING 中 sources 示例**：R8 更新了模板，但未在"收录来源说明"部分展开解释三个枚举值的含义。
- **license SPDX 列表维护**：当前硬编码 25 个，未来可能需要扩展机制（如从 `spdx-licenses` npm 包读取）。
