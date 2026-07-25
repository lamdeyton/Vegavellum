# R48: url 字段协议白名单校验（防 javascript: XSS 注入）

## 触发点

R47 修复了 JSON-LD `set:html` 的 XSS 漏洞并确立四维度审计模式（vertical + horizontal + connection + security）。但 R47 只覆盖了**显式 HTML 注入点**（`set:html`），未审计**属性注入点**（`<a href={...}>`）。

R48 是 R47 security 审计的 connection 续轮：审计所有由数据驱动的 URL 渲染点，发现 `url` 字段缺协议白名单，存在真实可利用的 XSS 漏洞。

## 审计过程

### 三类审计

| 类型 | 范围 | 结果 |
|------|------|------|
| Vertical | 跨文件搜索 `set:html`、`is:raw`、`innerHTML` 等显式注入点 | 仅 Base.astro:64（R47 已修复）✓ |
| Horizontal | 逐文件检查由数据驱动的 `href={...}` 属性注入点 | ProjectCard.astro:27 `href={project.url}`、[slug].astro:77 `href={project.url}` —— validator 仅校验 `new URL()` 不抛错，未限制协议 |
| Connection | validator 校验 ↔ 渲染层安全契约对齐 | **GAP**：`new URL("javascript:alert(1)")` 不抛错，通过校验后渲染为 `<a href="javascript:alert(...)">` 可点击 XSS 链接 |

### 攻击向量验证

构造攻击样本 `data/projects/attack-sample.yaml`：

```yaml
url: javascript:alert(document.cookie)
```

**完整攻击链验证**：

1. `npm run validate` —— **0 错误 0 警告**（原 validator 漏过）
2. `npm run build` —— 17 页生成成功
3. 检查 `dist/project/attack-sample/index.html` —— 渲染出：
   ```html
   <a href="javascript:alert(document.cookie)" target="_blank" rel="noopener noreferrer">
     javascript:alert(document.cookie) ↗
   </a>
   ```
4. 用户点击"官网"链接 → 执行任意 JS（盗 cookie、CSRF、钓鱼跳转等）

**大小写变体验证**：`VBScript:MsgBox("xss")` 同样通过原 validator，因为 `new URL("VBScript:...")` 不抛错（URL 规范允许任意 scheme）。

### 同型对齐分析

| 字段 | 渲染为 | 风险 | 现状 |
|------|--------|------|------|
| `project.url` | `<a href={project.url}>` | **可注入 javascript:** | R48 修复（白名单 http/https） |
| `project.repo` | `<a href={https://github.com/${repo}}>` | 前缀固定 https://，无法注入协议 | ✓ 无需修复 |
| `category.id` | `${base}/category/${id}/` | urlFriendlyRe 校验（`^[a-z0-9]+(-[a-z0-9]+)*$`），无法注入 `:` | ✓ 无需修复 |
| `project.slug` | `${base}/project/${slug}/` | urlFriendlyRe 同上 | ✓ 无需修复 |

## 修复方案

在 `scripts/validate-data.mjs` 的 url 字段校验中，`new URL()` 解析后追加协议白名单检查：

```javascript
try {
  const parsed = new URL(p.url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    fail(`${label}: url "${p.url}" 协议 "${parsed.protocol}" 不在白名单 {http, https} 内（防 XSS 注入，如 javascript: 协议点击触发任意 JS）`);
  }
} catch {
  fail(`${label}: url "${p.url}" 不是合法 URL（应带协议，如 https://example.com）`);
}
```

**关键点**：
- `new URL().protocol` 自动归一化为小写（`VBScript:` → `vbscript:`），所以大小写变体也被拦截
- 协议白名单只允许 `http:` / `https:`（注意 `URL.protocol` 带尾冒号），与渲染层 `<a href>` 安全契约对齐
- 同步更新文件头注释、CONTRIBUTING.md、README.md 数据校验描述

## 验证

### 攻击样本回归

| 攻击样本 | 修复前 | 修复后 |
|---------|--------|--------|
| `javascript:alert(document.cookie)` | ✓ 通过（漏洞） | ✗ 拦截 |
| `data:text/html,<script>alert(1)</script>` | ✓ 通过（漏洞） | ✗ 拦截 |
| `VBScript:MsgBox("xss")` | ✓ 通过（漏洞） | ✗ 拦截（大小写归一化） |

### MVP 回归

```
npm run validate → 0 错误 / 0 警告 ✓
npm run build → 16 页生成成功 ✓
```

## 教训

1. **XSS 防御不能只盯 `set:html`**：R47 修复了显式 HTML 注入，但 `<a href={...}>` 属性注入同样危险。安全审计必须覆盖**所有由数据驱动的 HTML 属性**（href、src、style、onclick 等）。

2. **`new URL()` 不是安全函数**：`new URL("javascript:...")` 不抛错，因为 URL 规范允许任意 scheme。**"能解析" ≠ "安全"**，必须配合协议白名单。

3. **同型对齐思维**：审计 XSS 时不能只看一个字段，必须枚举所有"由数据驱动的 URL 渲染点"，逐字段判断是否有协议注入风险。本项目只有 `url` 字段有此风险（其他字段或经正则校验、或有固定前缀），但审计必须覆盖到才能下结论。

4. **安全审计的 connection 维度**：validator 校验 ↔ 渲染层安全契约必须对齐。validator 校验"合法 URL"但渲染层需要"http/https URL"，这是契约错位。R48 是 R47 的 connection 续轮——R47 修了 set:html，R48 修了 href 属性，两层共同构成完整的 XSS 防御。

## 变更文件

- `scripts/validate-data.mjs` —— url 字段加协议白名单校验 + 文件头注释同步
- `CONTRIBUTING.md` —— 数据校验描述同步 R48
- `README.md` —— 数据校验描述同步 R48
- `iterations/48-url-protocol-whitelist-xss-defense.md` —— 本轮迭代记录
- `iterations/README.md` —— 索引同步 R48
