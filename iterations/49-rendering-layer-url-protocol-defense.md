# R49：渲染层 url 协议白名单防御（R48 同型遗漏补全）

## 触发

R48 在 validator 中加了 url 协议白名单（只允许 http/https），防御 `javascript:` / `data:` / `vbscript:` 协议注入到 `<a href>` 触发 XSS。但 R48 只做了 validator 层（CI 守门员），未做渲染层守门员（data.ts）。

这与 R44-R46 确立的"三层防御闭环"模式不一致：
- validator（CI 守门员）— fail-fast，CI 拦截
- data.ts（渲染层守门员）— dev 模式不跑 validator，data.ts 是最后防线
- TypeScript interface（编译时类型）— 仅编译时，运行时无效

R44/R45 修复了 categories/projects 顶层和元素级 null 防御，R46 修复了 tags 字段 Array.isArray 防御，均在 data.ts 渲染层。R48 只做 validator 层，是同型遗漏。

## 真实攻击向量

```
贡献者提交 PR 含 `url: "javascript:alert(document.cookie)"`
  ↓
维护者拉取 PR 到本地测试（npm run dev）
  ↓
dev 模式不跑 validator（R48 防御失效）
  ↓
data.ts getAllProjects() 无字段校验，原样返回 project.url
  ↓
ProjectCard.astro / [slug].astro 渲染 `<a href="javascript:alert(...)">官网 ↗</a>`
  ↓
开发者/审查者点击"官网"链接 → 执行任意 JS → 窃取 cookie / localStorage
```

生产环境（CI build）安全：CI 跑 validator → R48 拦截 → build 失败 → 不部署。但 dev 模式是开发者审查 PR 的必经环节，XSS 风险真实存在。

## 修复方案

在 `src/lib/data.ts` 中新增 `sanitizeProjectUrl` 函数，对 project.url 做协议白名单过滤：

```ts
function sanitizeProjectUrl(url: unknown, slug: string | undefined): string | undefined {
  if (url === undefined || url === null) return undefined;
  if (typeof url !== 'string') {
    console.error(`[Vegavellum] 项目 ${slug || '(unknown)'}: url 字段类型错误（${typeof url}），已忽略该字段。请运行 \`npm run validate\` 检查数据格式。`);
    return undefined;
  }
  if (url === '') {
    console.error(`[Vegavellum] 项目 ${slug}: url 为空字符串，已忽略该字段。请运行 \`npm run validate\` 检查数据格式。`);
    return undefined;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      console.error(`[Vegavellum] 项目 ${slug}: url "${url}" 协议 "${parsed.protocol}" 不在白名单 {http, https} 内（防 XSS 注入），已忽略该字段。请运行 \`npm run validate\` 检查数据格式。`);
      return undefined;
    }
    return url;
  } catch {
    console.error(`[Vegavellum] 项目 ${slug}: url "${url}" 不是合法 URL，已忽略该字段。请运行 \`npm run validate\` 检查数据格式。`);
    return undefined;
  }
}
```

在 `getAllProjects()` 返回前应用：

```ts
return validProjects
  .filter((p) => p.status === 'published')
  .map((p) => ({ ...p, url: sanitizeProjectUrl(p.url, p.slug) }));
```

## 防御深度对齐矩阵

| 防御层 | url 协议白名单 | 实现位置 |
|--------|---------------|---------|
| validator（CI） | R48 已修复 | `scripts/validate-data.mjs` L384 |
| data.ts（渲染层） | **R49 修复** | `src/lib/data.ts` sanitizeProjectUrl |
| TypeScript interface | 不适用（运行时无效） | — |

与 R44-R46 渲染层防御模式同型对齐：
- R44：getAllCategories + getAllProjects 顶层 null/非对象防御
- R45：getAllCategories 元素级 null 防御
- R46：tags 字段 Array.isArray 防御
- **R49：url 字段协议白名单防御**

## 不静默 fallback 模式

与 R44-R46 一致：
1. 检测到非法 url → `console.error` 报告错误（含项目 slug + 错误详情）
2. 返回 `undefined`（让渲染层 `project.url &&` 自然跳过官网链接渲染）
3. 错误信息指引运行 `npm run validate` 修复源数据

不静默 fallback：报告错误 + 兜底避免崩溃 + 指引修复源数据。

## 攻击样本验证

### 测试样本

`data/projects/astro.yaml` 临时修改：
```yaml
url: javascript:alert(document.cookie)
```

### 验证结果

`ASTRO_TELEMETRY_DISABLED=1 npm run build`：

```
[Vegavellum] 项目 astro: url "javascript:alert(document.cookie)" 协议 "javascript:"
不在白名单 {http, https} 内（防 XSS 注入），已忽略该字段。请运行 `npm run validate` 检查数据格式。
```

- ✅ build 不崩溃，16 页面全部生成
- ✅ 错误日志清晰报告非法协议 + 指引 validator
- ✅ `dist/` 下 grep `javascript:alert` 无任何匹配（XSS 链接被过滤）
- ✅ `dist/project/astro/index.html` 无"官网"区块（url=undefined，渲染层 `project.url &&` 跳过）

### 攻击向量变体覆盖

`sanitizeProjectUrl` 通过 `new URL().protocol` 解析，覆盖所有协议变体：
- `javascript:alert(1)` → protocol `javascript:` → 拦截 ✓
- `JavaScript:alert(1)` → URL 归一化为 `javascript:` → 拦截 ✓
- `data:text/html,<script>alert(1)</script>` → protocol `data:` → 拦截 ✓
- `vbscript:msgbox` → protocol `vbscript:` → 拦截 ✓
- `VBScript:msgbox` → URL 归一化为 `vbscript:` → 拦截 ✓

## MVP 回归

修复后运行 `npm run validate && npm run build`：
- ✅ validate：0 错误，0 警告
- ✅ build：16 页面全部构建成功

## 教训

### 教训 1：安全修复必须三层对齐

R48 只做 validator 层，未做渲染层，是同型遗漏。安全修复必须审计所有防御层：
- validator（CI）
- data.ts（渲染层/dev 模式）
- TypeScript interface（编译时）

任何一层缺失都会形成 dev 模式漏洞。

### 教训 2：dev 模式是真实攻击面

PR 审查流程中，维护者会拉取 PR 到本地测试（dev 模式）。dev 模式不跑 validator，所以 data.ts 是唯一守门员。不能假设"validator 拦截了就安全"。

### 教训 3：R44-R46 模式确立后必须同型传播

R44-R46 确立了"渲染层防御 + 不静默 fallback + 指引 validator"模式。R47/R48 是安全审计续轮，但只做了 validator 层。每次新增 validator 校验时，必须审计：渲染层是否需要同型对齐？

## 修改文件

- `src/lib/data.ts`：新增 `sanitizeProjectUrl` 函数 + `getAllProjects()` 应用过滤
