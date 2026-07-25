# R51：repo 字段空段校验（R37/R40 同型补全）

## 背景

R50 完成 dev/build 自动跑 validator 的根因修复后，进入 R51 四维度审计（vertical + horizontal + connection + security）。

审计方向 1（Security）：检查渲染层属性注入点（aria-label/title 等HTML 属性注入风险）。结论：Astro 默认对 `{...}` 表达式中的字符串进行 HTML 转义（文本和属性都会转义），双引号转义为 `&quot;`，`<` 转义为 `&lt;`，无法逃逸属性或注入脚本。`set:html` 只有 Base.astro JSON-LD 一处，R47 已修复。url 协议白名单 R48/R49 已修复。无新 XSS gap。

审计方向 2（Horizontal）：字段定义 ↔ 校验逻辑对齐。逐字段检查 validator 校验链完整性，发现 **repo 字段格式校验链不完整**：

## Gap（N1，CRITICAL）

validator 第 322 行（R51 修复前）校验 repo 格式：
```js
if (typeof p.repo === 'string' && p.repo && (p.repo.split('/').length !== 2 || p.repo.includes('://'))) {
  fail(`${label}: repo "${p.repo}" 应为 owner/repo 格式`);
}
```

该校验只检查 `split('/')` 长度为 2，**未检查每段非空**。以下攻击样本通过校验：

| 攻击样本 | split('/') 结果 | 长度 | owner | repo | 生成的 GitHub URL | 效果 |
|---------|----------------|------|-------|------|------------------|------|
| `repo: "withastro/"` | `['withastro', '']` | 2 | withastro | '' | `https://github.com/withastro/` | 404 |
| `repo: "/astro"` | `['', 'astro']` | 2 | '' | astro | `https://github.com//astro` | 浏览器解析为 `https://github.com/astro` |
| `repo: "/"` | `['', '']` | 2 | '' | '' | `https://github.com//` | 浏览器解析为 `https://github.com/` |

这不是 XSS（Astro 转义 + GitHub URL 固定前缀），但会生成无效 GitHub URL，用户点击后 404 或跳转到错误页面。

## 同型对齐分析

repo 字段格式校验链（修复前）：
- R1：split('/') 长度为 2 + 不含 '://'（基础格式）
- R37：前后空格校验（`repo !== repo.trim()`）
- R40：中间空格校验（`/\s/.test(repo)`）
- **R51：空段校验（owner/repo 段均非空）** ← 补全

R37/R40 校验了空格，但遗漏了"空字符串段"。`repo: "withastro/"` 无空格（前后/中间均无），通过 R37/R40，但 owner/repo 段为空。

## 修复方案

将原校验重构为先 split 再分段校验：

```js
// R51 修复后
if (typeof p.repo === 'string' && p.repo) {
  const parts = p.repo.split('/');
  if (parts.length !== 2 || p.repo.includes('://')) {
    fail(`${label}: repo "${p.repo}" 应为 owner/repo 格式`);
  } else if (!parts[0] || !parts[1]) {
    // R51：空段校验（R37/R40 同型补全，Horizontal gap 修复）
    fail(`${label}: repo "${p.repo}" 的 owner 或 repo 段为空，应为 "owner/repo" 格式（如 withastro/astro）`);
  }
}
```

`else if` 确保只在格式校验通过（2 段）时才检查空段，避免对格式错误的数据输出冗余错误。

## 攻击样本验证

| 攻击样本 | 修复前 | 修复后 |
|---------|--------|--------|
| `repo: "withastro/"` | ✓ 通过（0 errors） | ✗ 拦截 `repo "withastro/" 的 owner 或 repo 段为空` |
| `repo: "/astro"` | ✓ 通过（0 errors） | ✗ 拦截 `repo "/astro" 的 owner 或 repo 段为空` |
| `repo: "/"` | ✓ 通过（0 errors） | ✗ 拦截 `repo "/" 的 owner 或 repo 段为空` |

## MVP 回归

- `npm run validate`：0 errors, 0 warnings ✓
- `npm run build`：16 pages built successfully ✓

## 文档同步

- scripts/validate-data.mjs 头部注释：repo 格式说明补充 "owner/repo 段均非空"
- README.md 数据校验描述：补充 "repo 空段校验防 owner/repo 为空生成无效 URL（R51）"
- CONTRIBUTING.md 本地验证描述：补充 "repo 空段校验（防 owner/repo 为空生成无效 URL）"
- iterations/README.md：添加 R51 条目

## 模式确认

- **同型对齐全链路模式**：repo 格式校验链 R1（基础格式）→ R37（前后空格）→ R40（中间空格）→ R51（空段），每轮补全一个同型遗漏
- **Horizontal 审计模式**：字段定义 ↔ 校验逻辑对齐，逐字段检查校验链完整性，发现"校验了长度但未校验内容"的 gap
- **分段校验模式**：split 后逐段校验非空，与 R35（tags/sources 元素级校验）同型——数组/分段都要校验每个元素非空
