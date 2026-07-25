# R50：dev/build 自动跑 validator（消除 dev 模式绕过漏洞类）

## 背景

R44-R49 出现明显的"打补丁"模式：每一轮都因为"dev 模式不跑 validator"而在 `data.ts`
渲染层加一道防御性检查：

| 轮次 | dev 模式绕过的具体问题 | 渲染层补丁 |
|------|----------------------|-----------|
| R44 | categories.yaml 空文件 → `parse('')` 返回 null → 调用方 `.map()` 崩溃 | data.ts 加顶层 null/非数组防御 + `[]` 兜底 |
| R44 | 单项目文件空 → `null as Project` → `null.status` TypeError 崩溃 | 同上 |
| R45 | categories.yaml `- null` 元素 → `[id].astro getStaticPaths()` `null.id` 崩溃 | data.ts 加元素级 filter |
| R46 | `tags: cli`（字符串）→ `project.tags.map()` TypeError 崩溃 | 渲染层 `Array.isArray` 检查 |
| R49 | `url: "javascript:alert(1)"` → `<a href="javascript:...">` XSS | data.ts `sanitizeProjectUrl` 协议白名单 |

每一轮都是同一个根因的不同表现：**dev 模式（`npm run dev`）和本地构建（`npm run build`）
都不跑 validator**，只有 CI 跑。这意味着：

1. 维护者拉取 PR 本地测试 → dev 模式跳过 validator → 各种违例数据进入渲染层
2. 每加一项 validator 检查，都要在 data.ts 加一道对应防御，否则 dev 模式就有漏洞
3. 防御深度对齐矩阵变成"validator 顶层 ↔ data.ts 顶层 / validator 元素级 ↔ data.ts
   元素级 / validator 字段级 ↔ data.ts 字段级"逐字段打补丁，维护成本高且易遗漏

## 审计发现

R49 完成后进行三类审计：

**Vertical（跨文件）**：validator ↔ data.ts ↔ 渲染层 ↔ YAML 数据，全字段防御深度对齐 ✓

**Horizontal（同文件）**：`Array.isArray` 检查在 ProjectCard/[slug].astro 一致；
`?? []` 静默兜底反模式已在 R41 清理 ✓

**Connection（传播）**：发现关键 gap——validator 只在 CI 跑，dev 模式和本地 build 都
不跑。R44/R45/R46/R49 全是在补这个 gap 的具体表现，但每次只补一个字段，治标不治本。

### 判断标准对照

- **触发是外部压力**：✓ R44-R49 五轮 dev 模式绕过 bug 是真实摩擦，每轮都抓到真 bug
- **产物可执行**：✓ 改 `package.json` 脚本 + CI workflow + 文档，可验证
- **完成信号可证伪**：✓ 攻击样本（非法 url）注入后 `npm run dev` 应被 validator 拦截

## 修复方案

**根本修复**：让 `npm run dev` 和 `npm run build` 自动先跑 `npm run validate`。

```json
{
  "scripts": {
    "dev": "npm run validate && astro dev",
    "build": "npm run validate && astro build",
    "preview": "astro preview",
    "validate": "node scripts/validate-data.mjs"
  }
}
```

CI workflow 移除冗余的显式 `Validate data` step（`npm run build` 已自动跑 validator）：

```yaml
- name: Install dependencies
  run: npm ci
- name: Build
  run: npm run build
```

### 设计决策

1. **为何不用 npm `predev`/`prebuild` 钩子**：npm 的 `pre*` 脚本是隐式行为，对贡献者
   不透明。显式 `npm run validate && astro dev` 让"dev 前先校验"的意图在 package.json
   中一目了然。

2. **为何不删除 `npm run validate` 独立脚本**：保留独立 validate 脚本便于贡献者只跑
   校验不启动 dev server（快速反馈循环）。

3. **为何移除 CI 的显式 validate step**：`npm run build` 现在已包含 validate，CI 再
   显式跑 `npm run validate` 会重复执行。单一事实源是 `package.json`，CI 只需
   `npm run build`。

4. **保留 data.ts 渲染层防御**：R44-R49 的 data.ts 防御检查**不移除**。它们现在是
   "defense in depth"——validator 是第一道防线（dev/build 启动时拦截），data.ts 是
   第二道防线（contributor 绕过 validator 直接跑 `npx astro dev` 时仍保护渲染层）。

5. **绕过校验的逃生口**：贡献者如需调试 data.ts 渲染层防御（如故意注入非法数据测试
   防御逻辑），可直接执行 `npx astro dev` / `npx astro build` 绕过 validator。这是
   有意设计的逃生口，已在 README/CONTRIBUTING 文档说明。

## 攻击样本验证

### 攻击向量

修改 `data/projects/astro.yaml`：

```yaml
url: javascript:alert(document.cookie)
```

### R50 修复前（R49 状态）

`npm run dev` → astro dev 启动 → dev 模式不跑 validator → data.ts `sanitizeProjectUrl`
拦截 → console.error 报告 → url 字段被过滤为 undefined → 渲染层跳过"官网"区块。

**问题**：dev server 启动成功，维护者需要主动看 console 才知道数据有问题。如果维护者
不看 console，会以为数据没问题继续测试。

### R50 修复后

`npm run dev` → `npm run validate` 先跑 → validator 检测到 `url: javascript:...` 协议
不在白名单 → fail → validator 退出码 1 → `&&` 短路 → astro dev 不启动 → 维护者看到
清晰的 validator 错误信息，必须修复数据才能启动 dev server。

**优势**：fail-fast，维护者在 dev server 启动前就知道数据有问题，不会带着违例数据
继续测试。

## MVP 回归

- `npm run validate`：0 错误 / 0 警告 ✓
- `npm run build`：validator 自动跑通过 + 16 页面构建成功 ✓
- 攻击样本验证：注入 `url: javascript:alert(document.cookie)` 后 `npm run dev`
  被 validator 拦截，dev server 不启动 ✓

## 防御深度对齐矩阵（R50 后）

| 防御层 | 顶层 null/非对象 | 元素级 null | 字段级 typeof | url 协议白名单 |
|--------|----------------|------------|--------------|---------------|
| validator（CI + dev + build） | R36/R41 | R37 | R28/R29/R31 | R48 |
| data.ts（渲染层兜底） | R44 | R45 | — | R49 |
| 渲染层（组件内） | — | — | Array.isArray (R46) | `project.url &&` 跳过 |

R50 后 validator 成为 universal gatekeeper（CI + dev + build 都跑），data.ts 从"dev
模式唯一守门员"降级为"defense in depth 第二道防线"。

## 教训

1. **接通型 gap 优先于补丁型 gap**：R44-R49 都是在补"dev 模式不跑 validator"这个
   接通 gap 的具体表现，每次只补一个字段。R50 一次性修复接通 gap，整类 dev 模式绕过
   bug 全部消除。后续新增 validator 检查自动覆盖 dev 模式，无需再在 data.ts 加对应
   防御。

2. **"validator 是 CI 守门员"原则应升级为"validator 是 build/dev 守门员"**：CI 只是
   build 的一个执行环境，本地 build 和 dev 应与 CI 行为一致。`package.json` 是行为
   单一事实源，CI 只调 `npm run build`，不应在 CI workflow 里重复声明 validate 步骤。

3. **逃生口要显式文档化**：`npx astro dev` 绕过 validator 是有意设计的逃生口，但必须
   在 README/CONTRIBUTING 中说明，否则贡献者不知道有这个逃生口，遇到 validator 拦截
   时会困惑。
