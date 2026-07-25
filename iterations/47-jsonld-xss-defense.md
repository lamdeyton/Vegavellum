# R47：JSON-LD XSS 防御（set:html + JSON.stringify 未转义 `<`）

## 触发（外部压力）

R46 完成后三类审计未发现 CRITICAL 崩溃 gap，转向安全角度审计。发现 Base.astro 第 64 行 JSON-LD 注入存在 XSS 风险：

```astro
<script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />
```

`set:html` 是 Astro 的原始 HTML 注入指令，不做转义。`JSON.stringify` 不会转义 HTML 特殊字符（`<`、`>`、`&`）。如果 jsonLd 对象的字段值包含 `</script>`，浏览器解析 `<script>` 标签时会提前结束，后续内容作为 HTML 执行。

## Gap 描述

### 攻击场景

1. 贡献者提交 PR，项目 `name` 字段含恶意 payload：
   ```yaml
   name: Next.js</script><script>alert(1)</script>
   ```
2. validator 不校验字段内容 HTML 特殊字符（R31 只校验 typeof string）
3. `[slug].astro` 第 40 行 `name: project.name` 将恶意 name 放入 BreadcrumbList JSON-LD
4. Base.astro 第 64 行 `set:html={JSON.stringify(jsonLd)}` 输出：
   ```html
   <script type="application/ld+json">
   {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
     {"@type":"ListItem","position":3,"name":"Next.js</script><script>alert(1)</script>","item":"..."}
   ]}
   </script>
   ```
5. 浏览器 HTML 解析器遇到 `</script>` 提前结束 JSON-LD script 标签
6. 后续 `<script>alert(1)</script>` 作为独立 script 标签执行 → **XSS 攻击**

### 严重度评估

- **数据来源风险**：
  - A 层（人工策展）：维护者审核，风险低
  - B 层（社区 PR）：贡献者提交，风险中（可能恶意或误写）
  - C 层（自动发现）：GitHub API，风险低（GitHub 不允许仓库名含 `</script>`）
- **实际可利用性**：中等——需要贡献者提交含 `</script>` 的字段值
- **影响范围**：全站所有使用 JSON-LD 的页面（project 详情页 / category 页 / 首页）

### 标准修复模式

JSON-LD XSS 是已知问题，标准做法是对 `JSON.stringify` 的结果转义 `<` 字符为 `\u003c`：
- JSON 解析器会将 `\u003c` 解析回 `<`，JSON-LD 语义不变
- HTML 解析器不会将 `\u003c/script` 识别为 `</script>` 标签结束，XSS 被阻止

## 修复

```astro
<!-- 修复前 -->
<script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />

<!-- 修复后 -->
<script type="application/ld+json" set:html={JSON.stringify(jsonLd).replace(/</g, '\\u003c')} />
```

`.replace(/</g, '\\u003c')` 将所有 `<` 替换为 `\u003c`：
- `/g` 全局替换（不只第一个）
- `\\u003c` 是 JavaScript 字符串中的 `\u003c`（反斜杠转义）
- JSON 解析时 `\u003c` → `<`，语义不变
- HTML 解析时 `\u003c/script` 不是 `</script>`，不结束 script 标签

## MVP 回归验证

### 正常数据回归

```
npm run validate  → ✓ 0 错误 0 警告
npm run build     → ✓ 16 页面构建成功
```

### 攻击样本验证（CRITICAL）

**测试方法**：临时将 `data/projects/nextjs.yaml` 的 `name` 字段改为含 `</script><script>alert(1)</script>` 的恶意 payload，运行 build，检查输出 HTML。

**修复前行为**（推断）：
- `JSON.stringify` 输出含 `</script>` 的 JSON 字符串
- `set:html` 注入到 `<script type="application/ld+json">` 标签内
- 浏览器遇到 `</script>` 提前结束 JSON-LD script 标签
- `<script>alert(1)</script>` 作为独立 script 标签执行 → XSS

**修复后行为**（实测）：
- build 16 页面成功（HTML 结构未被 `</script>` 破坏）
- `grep -c '\\u003c/script' dist/project/nextjs/index.html` → 1（转义后的序列存在）
- `grep -c "alert(1)" dist/project/nextjs/index.html` → 2
  - 1 次在 JSON-LD 的 name 字段值中（作为文本，`\u003c` 阻止了 script 标签结束，不会执行）
  - 1 次在页面 HTML 的 `<h1>` 或 `<title>` 中（被 Astro JSX 自动转义为 `&lt;`，不会执行）
- 无独立的 `<script>alert(1)</script>` 标签 → XSS 被阻止 ✓

恢复数据后：✓ 16 页面构建成功。

## 教训（安全审计模式确立）

**JSON-LD XSS 防御模式确立**：

1. **`set:html` + `JSON.stringify` 组合是 XSS 风险点**：
   - `set:html` 是原始 HTML 注入，不做转义
   - `JSON.stringify` 只处理 JSON 语法字符（`"`、`\`、控制字符），不处理 HTML 特殊字符
   - 两者组合时，JSON 字符串值中的 `</script>` 会破坏 script 标签

2. **`<script>` 标签的 HTML 解析规则**：
   - HTML 解析器在 `<script>` 标签内是"原始文本"模式
   - 遇到 `</script>`（大小写不敏感）立即结束标签，不解析内容
   - JSON 字符串值中的 `</script>` 会触发此行为

3. **标准转义模式**：
   - 替换 `<` 为 `\u003c`（JSON Unicode 转义）
   - JSON 解析时 `\u003c` → `<`，语义不变
   - HTML 解析时 `\u003c/script` 不是 `</script>`，不结束标签
   - 替换 `>` 为 `\u003e` 也是安全的，但 `<` 是关键（`</script>` 以 `<` 开头）

4. **Astro JSX 自动转义不覆盖 `set:html`**：
   - `{project.name}` 在 JSX 中会自动转义 `<` → `&lt;`（安全）
   - 但 `set:html={JSON.stringify(jsonLd)}` 是原始注入，不转义
   - 两者防御深度不同，`set:html` 需要手动转义

5. **安全审计是三类审计的第四维度**：
   - R36-R46 聚焦"健壮性"（不崩溃）
   - R47 扩展到"安全性"（不 XSS）
   - 三类审计 + 安全审计 = 四维度审计模式
   - 安全审计重点：`set:html` / `dangerouslySetInnerHTML` / `innerHTML` 等原始注入点

6. **validator 不校验内容安全，渲染层必须防御**：
   - validator 校验"字段类型"（typeof string）但不校验"字段内容"（是否含 HTML 特殊字符）
   - 校验字段内容是否含 `</script>` 会过度限制（项目名可能合法包含 `<` 字符）
   - 正确做法是在渲染层做转义，而非在 validator 拒绝含 `<` 的字段值

## 文件变更

- `src/layouts/Base.astro`：第 64 行 JSON-LD 注入加 `.replace(/</g, '\\u003c')` 转义。
- `iterations/README.md`：新增 R47 条目 + R47 列到 6 子目标演进表。
- `iterations/47-jsonld-xss-defense.md`：本文件。
