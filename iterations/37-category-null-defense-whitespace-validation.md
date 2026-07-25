# R37：Category 空条目防御 + free-text 空白字符串 + repo 前后空格校验

## 触发

R36 后三类审计发现 4 类真实 gap：

1. **Category 空条目/非对象未防御**（CRITICAL）：R36 给 Project 加了 null/非对象防御性检查，但同型的 Category 数组元素未防御。`categories.yaml` 中存在 `- null`（YAML 解析为 null）或 `- "string"`（误写标量）时，`for (const c of categories)` 循环内 `c.id` / `!c.name` 访问抛 `TypeError: Cannot read properties of null` 或连锁误报"缺少 name"。validator 崩溃，CI 失败但错误信息不可读。
2. **Category free-text 字段空白字符串**：`name: "   "` / `name_en: "  "` / `icon: " "` / `description: "    "` 等仅含空格的字符串通过必填校验（非空字符串 truthy）和 typeof 校验（是字符串），但语义为空，渲染为不可见空白——分类标题/图标/描述消失，用户无法识别分类。R36 只给 Project 加了空白字符串校验，同型 Category 5 字段遗漏。
3. **Project name/description 空白字符串**：同上模式，但 R36 未覆盖 Project 必填 free-text 字段。`name: "   "` 通过必填校验和 typeof 校验，但渲染为不可见标题，用户无法识别项目。
4. **Project license/language 空白字符串**：`license: "   "` / `language: "   "` 通过 R36 空字符串校验（`=== ''` 不命中），SPDX/license 校验仅 warn 不 fail，导致渲染空 badge。
5. **repo 前后空格**：`repo: " withastro/astro "` 通过 `split('/')` 格式校验（2 段），但生成的 GitHub URL `https://github.com/ withastro/astro ` 含空格，浏览器 404。

## 修复方案

1. **Category 空条目/非对象防御性检查**：在 `for (const c of categories)` 循环开头加 null/非对象检查，报错后 `continue`，同 R36 Project 防御同型对齐。
2. **Category free-text 空白字符串校验**：在 catStringFields 类型校验后加 `trim() === ''` 检查，覆盖 id/name/name_en/icon/description 全部 5 字段。
3. **Project name/description 空白字符串校验**：在 Project 必填字段类型校验后加 `trim() === ''` 检查，覆盖 name/description 两个 free-text 必填字段（slug/repo/category/addedAt/status 有格式/枚举/引用校验间接拦截空格）。
4. **Project license/language 空白字符串校验**：在 license/language 类型校验后加 `trim() === ''` 检查，与 R36 空字符串校验同型对齐。
5. **repo 前后空格校验**：在 repo 格式校验后加 `p.repo !== p.repo.trim()` 检查，提示修正为 `p.repo.trim()`。

## 关键代码变更

`scripts/validate-data.mjs`：

```javascript
// R37：Category 空条目/非对象防御性检查（同 R36 Project 防御，同型对齐）
for (const c of categories) {
  if (c === null || c === undefined) {
    fail(`分类条目为空或仅含注释（YAML 解析为 null），请填写分类数据或删除该条目`);
    continue;
  }
  if (typeof c !== 'object' || Array.isArray(c)) {
    fail(`分类条目必须是对象（YAML mapping），当前类型为 ${Array.isArray(c) ? 'array' : typeof c}`);
    continue;
  }
  // ... 原有校验逻辑
}

// R37：Category 空白字符串校验（free-text 必填字段，同 Project name/description 同型对齐）
for (const f of catStringFields) {
  if (typeof c[f] === 'string' && c[f].trim() === '') {
    fail(`分类 ${c.id}: ${f} 为空白字符串（仅含空格/制表符/换行），请填写有效内容`);
  }
}

// R37：Project name/description 空白字符串校验
const freeTextRequiredFields = ['name', 'description'];
for (const f of freeTextRequiredFields) {
  if (typeof p[f] === 'string' && p[f].trim() === '') {
    fail(`${label}: ${f} 为空白字符串（仅含空格/制表符/换行），请填写有效内容`);
  }
}

// R37：license 空白字符串校验
if (p.license !== undefined) {
  if (typeof p.license !== 'string') {
    fail(`${label}: license 必须是字符串，当前类型为 ${typeof p.license}`);
  } else if (p.license.trim() === '') {
    fail(`${label}: license 为空白字符串（仅含空格/制表符/换行），要么不写该字段，要么写有效 SPDX 标识符（如 MIT）`);
  }
}

// R37：repo 前后空格校验
if (typeof p.repo === 'string' && p.repo && p.repo !== p.repo.trim()) {
  fail(`${label}: repo "${p.repo}" 含前导/尾部空格，应为 "${p.repo.trim()}"`);
}
```

## 验证

- `npm run validate`：0 错误 0 警告（真实数据不受影响）
- `npm run build`：16 页全部生成
- 攻击样本验证（临时脚本 `_r37-smoke.mjs`）：5 类新校验全部生效，**意外发现 R37 修复不完整 → 触发 R38**

## 经验教训

1. **R36 同型对齐遗漏**：R36 给 Project 加了 null/非对象防御，但同型的 Category 数组元素未防御。同型对齐模式应覆盖**所有"遍历数组 + 访问字段"**的代码路径，而非单个 interface。
2. **free-text 字段两层空性**：R36 校验"空字符串"（`=== ''`），但遗漏"空白字符串"（`trim() === ''`）。两者语义相同（都渲染为不可见），都应拒绝。空值校验模式应扩展到 `trim()` 检查。
3. **R37 修复不完整**：R37 在 `for (const c of categories)` 循环内加了 null 防御，但漏掉循环**之前**的 `categories.map((c) => c.id)`（第 66 行计算 `categoryIds`），`- null` 仍在此处崩溃。R37 攻击样本验证暴露了这个 gap，触发 R38 紧急修复。教训：**修复一处防御性检查时，必须审计所有同型访问路径**，包括循环前的预处理。
