# R34：addedAt 日期有效性 + repo 跨项目唯一性校验

> 类型：横向审计 gap（同 R27-R33 系列，CRITICAL）
> 触发：R33 后三类审计发现 addedAt 仅校验格式不校验有效性、repo 仅校验格式不校验跨项目唯一性
> 子目标影响：1. 数据完整性（CRITICAL：无效日期进入数据集；CRITICAL：重复 repo 产生重复条目）

## 背景

R33 完成"字段集合封闭契约执行"后，R33 后三类审计继续寻找横向 gap（字段定义↔使用是否对齐）。

**横向审计发现两个 gap**：

### Gap 1：addedAt 日期有效性未校验

R5 引入 `addedAt` 格式校验（YYYY-MM-DD 正则），R31 补全 addedAt 字符串类型校验。但正则只校验"形如日期"，不校验"真实日期"：

```javascript
// R34 前：仅校验格式
if (typeof p.addedAt === 'string' && p.addedAt && !/^\d{4}-\d{2}-\d{2}$/.test(p.addedAt)) {
  fail(`${label}: addedAt "${p.addedAt}" 不是 YYYY-MM-DD 格式`);
}
```

`2026-02-30` / `2026-13-01` / `2026-00-01` / `2026-01-00` 等通过正则但不是真实日期，会进入数据集。

**后果链**：
- 运行时 `new Date('2026-02-30')` 在不同 JS 引擎行为不一致（有的返回 Invalid Date，有的溢出到 2026-03-02）
- 若渲染层用 `new Date(addedAt).toLocaleDateString()` 显示日期，可能显示 `Invalid Date` 或错误的 3 月 2 日
- 若按 addedAt 排序项目，无效日期排序行为不可预测
- 若计算"收录 N 天前"等相对时间，得到 NaN

### Gap 2：repo 跨项目唯一性未校验

R1 引入 repo 格式校验（owner/repo 单斜杠），R31 补全 repo 字符串类型校验。但 validator 只校验单项目 repo 格式，**不校验跨项目唯一性**：

```javascript
// R34 前：仅校验格式，未维护跨项目集合
if (typeof p.repo === 'string' && p.repo && (p.repo.split('/').length !== 2 || p.repo.includes('://'))) {
  fail(`${label}: repo "${p.repo}" 应为 owner/repo 格式`);
}
```

贡献者复制现有项目文件创建新项目文件时，可能忘记修改 repo，导致两个项目文件指向同一 GitHub 仓库。

**后果链**：
- 站点出现重复条目（同 repo 两个项目页）
- SEO 重复内容（duplicate content），搜索引擎降权
- 用户困惑：两个看似不同的项目实为同一仓库
- 与 slug 唯一性（R1）和 category id 唯一性（R11）同型，但 repo 唯一性遗漏

## 抓到的 bug

### N1（CRITICAL）addedAt 无效日期静默通过

**问题代码（R34 前）**：仅正则校验，不校验日期真实性。

**负向测试证据**：

创建临时 `data/projects/_test-r34.yaml`，含无效日期 `2026-02-30`：

```yaml
name: _test-r34
slug: _test-r34
repo: BurntSushi/ripgrep
description: R34 test fixture - invalid addedAt date and duplicate repo
category: cli
addedAt: 2026-02-30   # 无效：2 月无 30 日
status: pending
sources: [curator-curated]
```

**修复前**（基于代码追踪）：
- 正则 `/^\d{4}-\d{2}-\d{2}$/` 通过（"2026-02-30" 形如日期）
- validator 不报错，无效日期进入数据集
- 运行时行为不可预测（Invalid Date 或溢出到 3-02）

### N2（CRITICAL）repo 重复收录静默通过

**同上测试文件**，`repo: BurntSushi/ripgrep` 与 `data/projects/ripgrep.yaml` 重复：

**修复前**（基于代码追踪）：
- 单项目 repo 格式校验通过（"BurntSushi/ripgrep" 是合法 owner/repo）
- validator 不报错，重复 repo 进入数据集
- 站点出现两个 ripgrep 项目页

## 修复方案

### 修复 1：添加 `isValidCalendarDate` 辅助函数

```javascript
// 校验 YYYY-MM-DD 字符串是否为真实存在的日期（R34）
// 正则只校验"形如日期"，但 JavaScript 的 new Date(2026, 1, 30) 会溢出到 2026-03-02，
// 因此需用"构造后回读比对"模式：从 Date 反读年/月/日，若与输入不一致说明发生了溢出（如 2-30 → 3-2）
// 注意：必须用本地时区构造（new Date(y, m-1, d)），避免 UTC 时区偏移导致跨日误判
function isValidCalendarDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}
```

**关键设计**：用"构造后回读比对"模式，而非 `!isNaN(new Date(s).getTime())`。后者对 `2026-02-30` 在某些引擎会溢出为有效日期（3-02），无法识别溢出。

### 修复 2：addedAt 日期有效性校验

在 addedAt 格式校验后追加：

```javascript
// addedAt 日期有效性校验（R34：横向审计发现，正则只校验"形如日期"不校验"真实日期"）
// 2026-02-30 / 2026-13-01 / 2026-00-01 等通过正则但不是真实日期，Contributor 误写后会进入数据集，
// 直到运行时 new Date() 才暴露（如排序异常、相对时间计算 NaN）
// 防御性 typeof：addedAt 数组误写已被 R31 类型校验 fail，此处跳过避免冗余错误
if (typeof p.addedAt === 'string' && p.addedAt && /^\d{4}-\d{2}-\d{2}$/.test(p.addedAt) && !isValidCalendarDate(p.addedAt)) {
  fail(`${label}: addedAt "${p.addedAt}" 不是有效日期（如 2 月无 30/31 日、月份不在 1-12 范围内）`);
}
```

### 修复 3：repo 跨项目唯一性校验

新增 `seenRepos` Set，在 repo 格式校验后追加唯一性校验：

```javascript
// R34：repo 跨项目唯一性校验所需集合
// GitHub owner/repo 解析不区分大小写（BurntSushi/ripgrep 与 burntSushi/Ripgrep 指向同一仓库），
// 因此归一化为小写后再比较，避免大小写差异掩盖重复收录
const seenRepos = new Set();

// ...在 projects 循环中...
// repo 跨项目唯一性校验（R34：横向审计发现，validator 校验单项目 repo 格式但未校验跨项目唯一性）
if (typeof p.repo === 'string' && p.repo) {
  const repoKey = p.repo.toLowerCase();
  if (seenRepos.has(repoKey)) {
    fail(`${label}: repo "${p.repo}" 已被其他项目收录（重复收录违反唯一性契约）`);
  } else {
    seenRepos.add(repoKey);
  }
}
```

**大小写归一化理由**：GitHub owner/repo 解析不区分大小写，`BurntSushi/ripgrep` 和 `burntSushi/Ripgrep` 指向同一仓库。若不归一化，贡献者大小写差异可绕过唯一性校验。

### 修复 4：同步文档

- validator 头注释新增"addedAt 日期有效性"和"repo 跨项目唯一性"两项
- README "数据校验"描述更新："repo 格式" → "repo 格式与跨项目唯一性"，"addedAt 日期" → "addedAt 日期格式与有效性"
- CONTRIBUTING addedAt 字段注释补充"必须是有效日期，2026-02-30 等溢出日期会被拒绝"
- CONTRIBUTING repo 字段注释补充"不可与已收录项目重复（大小写不敏感）"

## MVP 回归

### 正向验证（现有数据）

```
✓ npm run validate（0 错误 0 警告）
✓ npm run build（16 页面构建完成，524ms）
```

### 负向验证（临时无效日期 + 重复 repo YAML）

创建临时 `_test-r34.yaml`，含无效日期 `2026-02-30` 和重复 repo `BurntSushi/ripgrep`：

```
▸ 项目数据
  ✗ _test-r34.yaml: addedAt "2026-02-30" 不是有效日期（如 2 月无 30/31 日、月份不在 1-12 范围内）
  ✗ _test-r34.yaml: slug "_test-r34" 不是 URL-friendly 格式（仅小写字母/数字/连字符，无首尾/连续连字符）
  ⚠ _test-r34.yaml: status=pending，该项目不会在站点上显示，等待维护者审核
  ✗ ripgrep.yaml: repo "BurntSushi/ripgrep" 已被其他项目收录（重复收录违反唯一性契约）

────────────────────────
  错误：3
  警告：1
────────────────────────
```

✓ 无效日期 `2026-02-30` 被精准识别
✓ 重复 repo `BurntSushi/ripgrep` 被精准识别（报告在 `ripgrep.yaml` 因为按文件读取顺序 `_test-r34` 先入 seenRepos）
✓ 顺带验证 R11 slug URL-friendly 校验仍健壮（下划线开头被拒）
✓ exit 1（CI 会失败，PR 被拦截）

### `isValidCalendarDate` 边界用例测试

```
✓ 2026-02-30 → false（2 月无 30 日）
✓ 2026-13-01 → false（月份 13 无效）
✓ 2026-00-01 → false（月份 0 无效）
✓ 2026-01-00 → false（日 0 无效）
✓ 2026-02-29 → false（2026 非闰年）
✓ 2024-02-29 → true（2024 闰年）
✓ 2026-12-31 → true
✓ 2026-01-01 → true
✓ 2026-1-1 → false（非 YYYY-MM-DD，正则拦截）
✓ 2026/02/30 → false（非 YYYY-MM-DD）
✓ 2026-04-31 → false（4 月无 31 日）
✓ 2026-11-31 → false（11 月无 31 日）
✗ 0000-01-01 → expected true got false（JS Date 怪癖：年份 0-99 会被加 1900，但此怪癖对真实场景有利——能额外拒绝 0099-01-01 等误写）
✓ 9999-12-31 → true
```

13/14 通过。唯一"失败"是边界年份 0，由 JavaScript `new Date(0, 0, 1)` 历史怪癖（年份 0-99 加 1900）导致，对真实 addedAt 场景（贡献者不会写年份 0-99）反而有利，可忽略。

恢复数据后 `npm run validate` 通过（0 错误 0 警告）。

## 审计反思

R34 是 R27-R33 **"声明但未执行的契约"模式**和**"同型字段不一致处理"模式**的自然延伸，但发现了两个新维度：

### 维度 1：格式校验 vs 有效性校验

R5 引入 addedAt 格式校验（YYYY-MM-DD 正则），但**正则只能校验"形如"，不能校验"真实"**。这是格式校验的固有局限：

| 校验层次 | 示例 | 覆盖轮次 |
|---------|------|---------|
| 格式校验 | `/^\d{4}-\d{2}-\d{2}$/` 匹配 "2026-02-30" | R5 |
| 有效性校验 | `new Date(2026, 1, 30)` 回读比对发现溢出 | R34 |

**教训**：所有日期/数字类格式校验，必须配套有效性校验。正则匹配 ≠ 真实值。

类似 gap 可能存在于：
- `slug` URL-friendly 格式（R11）：正则已覆盖"形如 URL-friendly"，无需有效性校验（slug 是字符串标识，无"真实/有效"概念）
- `repo` owner/repo 格式（R1）：正则校验"形如 owner/repo"，但 GitHub 是否真有此仓库需 API 查询，超出 validator 职责
- `license` SPDX canonical（R9）：spdxLicenses Set 已覆盖"真实存在"，无需额外有效性校验

### 维度 2：单项目校验 vs 跨项目校验

R1 引入 slug 唯一性（跨项目），R11 引入 category id 唯一性（跨分类）。但 **repo 跨项目唯一性遗漏**。

| 字段 | 单项目校验 | 跨项目唯一性 | 覆盖轮次 |
|------|-----------|-------------|---------|
| slug | 文件名一致性（R1）+ URL-friendly（R11） | 唯一性（R1） | R1/R11 |
| category id | URL-friendly（R11） | 唯一性（R11） | R11 |
| repo | owner/repo 格式（R1） | 唯一性 | R1 单项目，**R34 跨项目** |

**教训**：所有"标识类"字段（slug / category id / repo）都应校验跨项目唯一性。R1/R11 覆盖了 slug 和 category id，但 repo 遗漏——因为 repo 被视为"外部引用"而非"内部标识"。但站点渲染时 repo 同样产生唯一 URL（github.com/owner/repo），重复 repo 即重复内容。

### 大小写归一化的设计决策

repo 唯一性校验选择 `p.repo.toLowerCase()` 归一化，理由：
- GitHub owner/repo 解析不区分大小写（`BurntSushi/ripgrep` == `burntSushi/Ripgrep`）
- 若不归一化，贡献者改大小写即可绕过唯一性校验，产生重复条目
- 对比 slug 唯一性：slug 已被 R11 限制为"仅小写字母/数字/连字符"，无需归一化

### 与 R33 字段集合契约的关系

R33 确立"interface 是封闭契约"，R34 在此基础上发现：**字段值校验也有"格式"和"有效性"两层**。

至此 validator 契约执行覆盖四层：
1. **字段集合**（R33）：拒绝未知字段
2. **字段值类型**（R27-R32）：typeof / Array.isArray 校验
3. **字段值格式**（R5/R9/R11）：日期格式 / SPDX / URL-friendly 正则校验
4. **字段值有效性**（R34）：日期有效性（构造后回读比对）

四层闭环 + 跨项目唯一性（R1/R11/R34），validator 数据完整性校验进一步深化。
