# R10 — Node 版本一致性 + CONTRIBUTING sources 文档化

> 超长程任务模式第十轮。修复 R9 审计识别的环境一致性与文档同步缺口。

## 触发原因

R9 完成后继续审计，发现三个真实一致性 gap：
1. CI 用 Node 20（`node-version: 20`），本地无 `.nvmrc`，贡献者可能用不同 Node 版本
2. `package.json` 无 `engines.node` 声明，npm 不警告版本不匹配
3. R8 给 CONTRIBUTING 模板加了 `sources` 字段，但"项目状态说明"只文档化了 status 枚举，未文档化 sources 枚举

## 审计发现

### N1（Vertical · 环境一致性）：Node 版本未锁定，CI 与本地可能不一致

**症状**：
- `.github/workflows/deploy.yml` 硬编码 `node-version: 20`
- 无 `.nvmrc` 文件，本地贡献者无法自动切换 Node 版本
- `package.json` 无 `engines` 字段

**影响**：
- 贡献者本地用 Node 16/22 可能遇到构建差异
- 未来升级 Node 版本需改两处（workflow + 文档），易遗漏

**修复**（三处协同）：
1. 创建 `.nvmrc`（内容 `20`）—— 单一来源
2. CI workflow 改用 `node-version-file: '.nvmrc'` 读取
3. `package.json` 添加 `"engines": {"node": ">=18"}`（Astro 4 最低要求）

```yaml
# .github/workflows/deploy.yml
- name: Setup Node
  uses: actions/setup-node@v4
  with:
    node-version-file: '.nvmrc'  # 原为 node-version: 20
    cache: npm
```

### N2（Horizontal · 文档）：CONTRIBUTING 未文档化 sources 枚举

**症状**：R8 在 CONTRIBUTING 模板加了 `sources: [community-nominated]`，但"项目状态说明"部分只列了 status 表，无 sources 表。贡献者不知道三个枚举值的含义。

**修复**：在 CONTRIBUTING 添加"收录来源说明"表：

```markdown
## 收录来源说明

| sources | 含义 |
|---------|------|
| `curator-curated` | 维护者人工策展（A 层） |
| `community-nominated` | 社区 PR 提名（B 层，贡献者填写此项） |
| `auto-discovered` | 机器人自动发现（C 层，未实现） |
```

同时在"开发环境"部分添加 Node 版本要求说明和 `nvm use` 指引。

## MVP 回归验证

```bash
ASTRO_TELEMETRY_DISABLED=1 npm run validate
# ✓ 数据校验通过（0 错误 0 警告）

ASTRO_TELEMETRY_DISABLED=1 npm run build
# ✓ 16 page(s) built in 455ms
```

无回归。

## 子目标深度演进

R10 后，6 子目标状态：
1. **数据完整性** — 深+
2. **路由正确性** — 深
3. **可访问性** — 中+
4. **SEO/元数据** — 深+
5. **部署链路** — 深+（Node 版本单一来源，CI 与本地一致）
6. **可扩展性** — 深

## 下一轮候选（R11 审计输入）

R10 完成后剩余候选：
- **`astro check` 未纳入 CI**：Astro 的 TypeScript/JSX 诊断命令未在 CI 中运行，可能遗漏类型错误。但项目用 strict tsconfig，build 本身会捕获语法错误。优先级低。
- **license SPDX 列表扩展机制**：当前硬编码 25 个，未来可能需要从 npm 包读取完整列表。属正式开发阶段增强。
- **种子数据规模**：当前 5 个种子项目覆盖 4 分类，满足验收标准 #5（至少 5 项目覆盖 3 分类），但 5 个分类无项目。属内容运营范畴，非技术 gap。
