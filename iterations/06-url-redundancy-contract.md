# R6：url 字段冗余 + 声明未执行契约

> 触发：R5 提交后继续主动三类审计。Horizontal 审计发现 ripgrep.yaml 的 `url` 字段与 `repo` 派生的 GitHub URL 完全相同，违反 CONTRIBUTING 声明的"无独立官网则省略 url"契约；validator 未拦截此违例。
>
> 这是一个 friction chain：R5 修了 license 数据规范，R6 继续查数据层其它"声明未执行"契约，自然命中 url 字段。

## 审计发现

### N1（Horizontal）：ripgrep.yaml url 字段与 repo URL 重复

**症状**：
```
data/projects/ripgrep.yaml:
  repo: BurntSushi/ripgrep
  url: https://github.com/BurntSushi/ripgrep   ← 与 https://github.com/${repo} 完全相同
```

**后果**：
- 项目详情页同时渲染"GitHub 仓库"和"官网"两行，指向同一个 URL，信息冗余且误导（repo 不是"官网"）
- 违反 [CONTRIBUTING.md](file:///Users/lamdeyton/Library/Application%20Support/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a6300d9dbe95cc4e806642c/CONTRIBUTING.md) 声明：`url: ... # 官网（无则省略，默认用 GitHub repo）`

**对比**：5 个种子项目中，仅 ripgrep 存在此违例；其余 4 个（nextjs/astro/deno/langchain）的 url 均为独立官网，与 repo URL 不同。

**修复**：从 [data/projects/ripgrep.yaml](file:///Users/lamdeyton/Library/Application%20Support/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a6300d9dbe95cc4e806642c/data/projects/ripgrep.yaml) 移除 `url` 字段。详情页将不再渲染"官网"行，只保留"GitHub 仓库"行。

### N2（Horizontal）：validator 未拦截 url === repoUrl

**症状**：CONTRIBUTING 声明 url 是可选官网字段、无则省略，但 [scripts/validate-data.mjs](file:///Users/lamdeyton/Library/Application%20Support/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a6300d9dbe95cc4e806642c/scripts/validate-data.mjs) 不校验 url 是否与 repo URL 重复。贡献者复制 repo URL 到 url 字段能静默通过。

**修复**：在 repo 格式校验后加警告（不失败，因为重复不算破坏性错误，但应提示）：
```javascript
if (p.url && p.repo && p.url === `https://github.com/${p.repo}`) {
  warn(`${label}: url "${p.url}" 与 repo URL 重复，无独立官网时应省略 url 字段`);
}
```

## MVP 回归验证

```
npm run validate
  ✓ 错误：0  警告：0（ripgrep url 移除后无违例）

ASTRO_TELEMETRY_DISABLED=1 npm run build
  ✓ 16 page(s) built in 488ms

可证伪性测试（url=repoUrl 被警告）：
  临时写入 dupe-url-test.yaml，url: https://github.com/foo/bar，repo: foo/bar
  → npm run validate
  ⚠ dupe-url-test.yaml: url "https://github.com/foo/bar" 与 repo URL 重复，无独立官网时应省略 url 字段
  ⠂ dupe-url-test.yaml: status=pending ...
  警告：2
  ✓ 校验逻辑真实生效

详情页渲染验证：
  ✓ dist/project/ripgrep/index.html "官网" 计数 = 0（已移除）
  ✓ dist/project/ripgrep/index.html "GitHub 仓库" 计数 = 1（repo 链接保留）
  ✓ dist/project/nextjs/index.html "官网" 计数 = 1（其它项目不受影响）
```

## 子目标进展

| 子目标 | R5 后 | R6 后 |
|--------|-------|-------|
| 1. 数据完整性 | 深+ | **深+**（新增 url≠repoUrl 契约校验 + ripgrep 数据修正） |
| 2. 路由正确性 | 深 | 深 |
| 3. 可访问性 | 中 | 中 |
| 4. SEO/元数据 | 深+ | 深+ |
| 5. 部署链路 | 深 | 深 |
| 6. 可扩展性 | 深 | 深 |

## 经验教训

1. **数据字段冗余是 Horizontal 审计的高价值靶点**：当一个可选字段的值可由另一字段派生时，冗余填写既是数据质量问题，也是契约违例。validator 应对"可派生却重复填写"的情况发警告。
2. **friction chain 的典型形态**：R5 修 license → R6 继续查数据层其它字段 → 命中 url。每修一个契约，下一轮审计自然聚焦同层其它契约。不要 batch，每个 friction 独立成轮。
3. **警告 vs 失败的边界**：url=repoUrl 是数据质量问题而非破坏性错误（站点仍能构建），用 warn 而非 fail。这与 R1-B5（pending/rejected 用警告）一致——不破坏构建但提示贡献者。

## 下轮计划

继续主动三类审计。R6 后数据层的"声明未执行"契约已基本覆盖（addedAt 格式、license SPDX、url 冗余、category 引用、slug 文件名、必填字段、枚举值、repo 格式）。下一轮重点转向：
- 子目标 3（可访问性）是否有 MVP 范围内的真实摩擦
- 构建产物/部署链路是否有遗漏
- 若 0 gap → 诚实停止，移交正式开发
