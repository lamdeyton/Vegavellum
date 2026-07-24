# R1：数据契约 + 路径一致性

> 触发：MVP 完成后的首轮三类审计（vertical / horizontal / connection）发现 5 处真实 bug/gap。

## 审计发现

### Vertical（跨文件一致性）

#### B1：base 路径双斜杠 bug

**症状**：`CategoryList.astro` 和 `category/[id].astro` 用 `import.meta.env.BASE_URL`（带尾斜杠 `/Vegavellum/`），而 `Base.astro`/`ProjectCard.astro`/`project/[slug].astro` 用 `BASE_URL.replace(/\/$/, '')`（去尾斜杠 `/Vegavellum`）。

**后果**：
- `CategoryList.astro` 渲染所有分类链接为 `/Vegavellum//category/frontend-framework`（双斜杠）
- `category/[id].astro` 的"返回首页"链接为 `/Vegavellum//`（双斜杠）

浏览器通常容错双斜杠，但这是真实的不一致，违反契约。

**修复**：统一所有文件的 base 处理为 `BASE_URL.replace(/\/$/, '')`（去尾斜杠），链接显式加 `/`。

涉及文件：
- `src/components/CategoryList.astro` line 10
- `src/pages/category/[id].astro` line 19

### Horizontal（字段 ↔ 使用）

#### B2：sources 契约不自洽

**症状**：`Project` 接口定义 `sources: string[]`（必填），但 `project/[slug].astro` line 17 做了 `Array.isArray(project.sources) ? project.sources : []` 防御性检查。

**后果**：契约不自洽——接口说必填，使用方说可选。贡献者不知道是否必须填写。

**修复**：将 `sources` 改为可选字段 `sources?: string[]`，与防御性检查对齐。设计文档第「项目数据」节明确标注 sources 是"自动维护字段，贡献者无需填写"，所以可选是正确的语义。

涉及文件：
- `src/lib/data.ts` Project 接口

### Connection（schema 传播）

#### B3：category id 引用无校验，静默失败

**症状**：项目 YAML 的 `category` 字段值必须与 `categories.yaml` 的 `id` 匹配，但无校验。若写错 id（如 `frontend` 而非 `frontend-framework`），`getCategoryById` 返回 undefined，详情页 `{category && ...}` 静默跳过分类芯片渲染。

**后果**：用户看不出问题，贡献者不知道哪里写错了。

**修复**：在 `scripts/validate-data.mjs` 中校验每个项目的 `category` 字段存在于 `categories.yaml` 的 id 集合中。

#### B4：slug vs 文件名契约不强制

**症状**：设计文档说"文件名即 slug"，但 `data.ts` 用 YAML 内部 `slug` 字段做路由，不校验文件名与 slug 一致。

**后果**：`data/projects/nextjs.yaml` 内部 `slug: next-js` 会生成 `/project/next-js` 路由，但文件名是 nextjs.yaml——契约不一致，贡献者易踩坑。

**修复**：在 `scripts/validate-data.mjs` 中校验 `basename(file, '.yaml') === data.slug`。

#### B5：pending/rejected 项目静默存在

**症状**：`status: pending/rejected` 项目被 `data.ts` 过滤，但文件仍存在 `data/projects/` 下。构建无任何提示。

**后果**：贡献者提交 PR 后不知道为什么自己的项目没上线。

**修复**：在 `scripts/validate-data.mjs` 中对 pending/rejected 项目输出警告（不失败，提示贡献者）。

## 实施的变更

### 代码修复
1. `src/components/CategoryList.astro` — base 路径统一去尾斜杠
2. `src/pages/category/[id].astro` — base 路径统一去尾斜杠
3. `src/lib/data.ts` — `Project.sources` 改为可选字段

### 新增文件
4. `scripts/validate-data.mjs` — 数据校验脚本，覆盖 B3/B4/B5 + 必填字段 + 枚举值 + repo 格式
5. `iterations/README.md` — 迭代记录目录说明
6. `iterations/01-data-contract-path-consistency.md` — 本轮记录

### 配置变更
7. `package.json` — 新增 `npm run validate` 脚本
8. `.github/workflows/deploy.yml` — CI 增加 `Validate data` 步骤 + `ASTRO_TELEMETRY_DISABLED` env
9. `astro.config.mjs` — 添加遥测禁用说明注释

## 过程中的额外发现

### E1：校验脚本命名冲突 bug

写校验脚本时，从 `node:path` 和 `yaml` 都 import 了 `parse`，导致 `SyntaxError: Identifier 'parse' has already been declared`。

**修复**：用 `import { parse as parseYaml } from 'yaml'` 重命名，并用 `basename(file, '.yaml')` 替代 `parse(file).name`。

### E2：Astro 遥测 EPERM（沙箱特有）

`astro build` 在沙箱中失败：`EPERM: operation not permitted, mkdir '/Users/lamdeyton/Library/Preferences/astro'`。

**根因**：Astro CLI 在加载 `astro.config.mjs` **之前**初始化遥测，尝试创建 `~/Library/Preferences/astro` 目录。沙箱禁止写该路径。

**尝试的失败方案**：在 `astro.config.mjs` 顶部 `process.env.ASTRO_TELEMETRY_DISABLED = '1'`——无效，因为遥测在 config 加载前就触发。

**最终方案**：
- `package.json` scripts 保持标准 `astro build`（真实开发机和 CI 不存在此问题）
- CI workflow 设置 `env: ASTRO_TELEMETRY_DISABLED: '1'`（CI 禁用遥测是良好实践）
- 沙箱验证用 `ASTRO_TELEMETRY_DISABLED=1 npm run build`

## MVP 回归验证

```
npm run validate
  ✓ 数据校验通过（5 项目、9 分类、0 错误、0 警告）

ASTRO_TELEMETRY_DISABLED=1 npm run build
  ✓ 15 page(s) built in 1.95s
  ✓ index.html
  ✓ category/{9 个分类}/index.html
  ✓ project/{5 个项目}/index.html
```

## 子目标进展

| 子目标 | R1 前深度 | R1 后深度 |
|--------|----------|----------|
| 1. 数据完整性 | 浅（无校验） | **深**（脚本 + CI 强制） |
| 2. 路由正确性 | 中（双斜杠） | **深**（base 统一） |
| 3. 可访问性 | 未涉及 | 未涉及 |
| 4. SEO/元数据 | 未涉及 | 未涉及 |
| 5. 部署链路 | 中 | **深**（CI 加校验步骤） |
| 6. 可扩展性 | 未涉及 | 未涉及 |

## 下轮计划

R2：SEO 完整性（sitemap + robots + OG tags + favicon）—— 子目标 4
R3：用户体验完善（404 + 首页统计 + 空分类 CTA + CONTRIBUTING + LICENSE）—— 子目标 3 + 6
R4：最终审计 + 三类 audit + 6 子目标全验证
