# R8 — 部署链路审计 + sources 枚举契约执行

> 超长程任务模式第八轮。延续 R1-R7 的三类审计方法论，聚焦部署链路完整性。

## 触发原因

R7 完成后执行三类审计时识别到两个真实风险：
1. CI workflow `branches: [main]` 不包含 `mvp-demo`，而 MVP 工作全部在 `mvp-demo` 分支进行 —— 验收标准 #4（"git push 到 mvp-demo 分支后，GitHub Actions 自动构建并部署"）无法满足，CI 从未端到端验证。
2. `sources` 字段在设计方案和 CONTRIBUTING 中暗示固定枚举，但 validator 未校验 —— 属"声明未执行的契约"（reverse reconciliation audit 的典型缺口）。

## 审计发现

### N1（Vertical · 部署链路 · CRITICAL）：CI workflow 未覆盖 mvp-demo 分支

**症状**：`.github/workflows/deploy.yml` 的 `on.push.branches` 仅声明 `[main]`，但当前所有 MVP 迭代提交都在 `mvp-demo` 分支（`git branch --show-current` 确认）。推送到 `mvp-demo` 不会触发 CI，验收标准 #4 形同虚设。

**影响**：
- MVP 阶段的 7 轮迭代修复从未经过 CI 端到端验证
- 若 `mvp-demo` 存在本地构建通过但 CI 环境失败的问题（如 Node 版本差异、依赖差异），无法发现
- 违反设计方案中 "git push 到 mvp-demo 分支后，GitHub Actions 自动构建并部署到 GitHub Pages" 的明确承诺

**修复**：
```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main, mvp-demo]  # 原为 [main]
  workflow_dispatch:
```

### N2（Horizontal · validator）：sources 字段枚举未校验

**症状**：`scripts/validate-data.mjs` 校验了 `status` 枚举，但未校验 `sources` 枚举。设计方案第 203 行明确声明 `sources: [auto-discovered] # auto-discovered | community-nominated | curator-curated`，CONTRIBUTING 也暗示这三个值。一个贡献者写 `sources: [unknown]` 能通过校验。

**Reverse reconciliation audit 发现过程**：
- Vertical 审计：`data/projects/*.yaml` ↔ `src/lib/data.ts` Project interface（sources?: string[]）✓
- Horizontal 审计：validate-data.mjs 声明的校验项 ↔ 实际实现 → 发现 sources 枚举缺失
- Connection 审计：设计方案 sources 定义 → validator 传播断裂

**修复**：
```javascript
// scripts/validate-data.mjs
const validSources = new Set(['auto-discovered', 'community-nominated', 'curator-curated']);
// ...
if (p.sources !== undefined) {
  if (!Array.isArray(p.sources)) {
    fail(`${label}: sources 必须是数组，当前类型为 ${typeof p.sources}`);
  } else {
    for (const s of p.sources) {
      if (!validSources.has(s)) {
        fail(`${label}: sources 值 "${s}" 不在枚举 {auto-discovered, community-nominated, curator-curated} 内`);
      }
    }
  }
}
```

同步更新 `CONTRIBUTING.md` 显式声明枚举：
```yaml
sources: [community-nominated]# 收录来源，枚举：auto-discovered | community-nominated | curator-curated
```

## 负向测试验证

为证明 N2 修复有效（非想象修复），构造非法数据验证拦截：

```bash
# 临时写入 sources: [unknown-source]
cp /tmp/bad-source-test.yaml data/projects/bad-test.yaml
npm run validate
# 输出：
#   ✗ bad-test.yaml: sources 值 "unknown-source" 不在枚举 {...} 内
# exit code: 1（正确失败）
rm data/projects/bad-test.yaml
```

## 其他审计结果（无需修复）

| 检查项 | 类型 | 结果 |
|--------|------|------|
| `package-lock.json` 存在 | Vertical | ✓ 与 package.json 同步 |
| `.gitignore` 排除 `dist/` `node_modules/` `.astro/` | Vertical | ✓ 无追踪孤儿 |
| `git ls-files dist/` 空结果 | Vertical | ✓ 无孤儿产物提交 |
| `tsconfig.json` extends astro/strict | Horizontal | ✓ include/exclude 合理 |
| `package.json` dependencies 锁版本 | Horizontal | ✓ Astro 4.16.19 + sitemap 3.2.1（避免 R0 兼容坑） |
| `astro.config.mjs` site + base | Horizontal | ✓ 与 GitHub Pages 路径一致 |
| 构建产物 `dist/404.html` 在根目录 | Vertical | ✓ GitHub Pages 404 约定 |
| sitemap-0.xml 含 15 URL（404 排除） | Vertical | ✓ noindex 页面不在 sitemap |
| Project schema 全字段传播到 UI | Connection | ✓ name/slug/repo/desc/category/url/license/tags/language/addedAt/status/sources 均被读取 |
| Category schema 全字段传播 | Connection | ✓ id/name/name_en/icon/description 均被使用 |

## MVP 回归验证

```bash
ASTRO_TELEMETRY_DISABLED=1 npm run validate
# ✓ 数据校验通过（5 项目、9 分类、0 错误、0 警告）

ASTRO_TELEMETRY_DISABLED=1 npm run build
# ✓ 16 page(s) built in 539ms
# 产物：404.html + index.html + 9 category + 5 project + sitemap + robots + favicon
```

无回归。

## 子目标深度演进

R8 后，6 子目标状态：
1. **数据完整性** — 深+（新增 sources 枚举校验，契约执行更彻底）
2. **路由正确性** — 深
3. **可访问性** — 中+
4. **SEO/元数据** — 深+
5. **部署链路** — 深+（CI 现在覆盖 mvp-demo 分支，验收标准 #4 真正可达）
6. **可扩展性** — 深

## 下一轮候选（R9 审计输入）

R8 三类审计发现的次要 gap（未在本轮修复，作为 R9 输入）：

- **license SPDX 规范性校验缺失**：CONTRIBUTING 声明"canonical SPDX 形式，如 MIT / Apache-2.0 / Unlicense"，但 validator 没有通用校验。R5 仅修复了具体文件的大小写。SPDX 列表庞大，简单大小写规则可能误判（如 Unlicense vs 0BSD），需评估实现策略。
- **iterations/README.md 轮次索引滞后**：R8 完成后需补 R8 行；这是文档同步问题，非代码 bug。
- **`.nvmrc` 缺失**：CI 用 Node 20，但本地无版本锁定文件。贡献者本地 Node 版本可能与 CI 不一致。低优先级。
