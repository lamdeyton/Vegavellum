# R13 — WCAG 3.1.2 Language of Parts 英文内容 lang 标注

> 超长程任务模式第十三轮。用户挑战 R12 "诚实收尾"结论，重启三类审计发现 a11y 深度 gap。

## 触发原因

R12 收尾后用户再次要求继续。根据 long-range-task-execution 经验证据（5/5 自停止都是错的），立即重启审计。本轮聚焦 R7 标注的"中+ 可访问性"中尚未覆盖的 WCAG 3.1.2 Language of Parts (Level A)。

## 审计发现

### N1（Vertical · 可访问性）：英文内容未标注 lang 属性，违反 WCAG 3.1.2

**症状**：`<html lang="zh-CN">` 声明页面主语言为中文，但页面内 4 处英文内容未标注 `lang="en"`：
1. `src/pages/index.astro` 第 25 行 `<p class="slogan-en">Weaving the GitHub galaxy onto one scroll.</p>`
2. `src/components/CategoryList.astro` 第 22 行 `<span class="name-en">{c.name_en}</span>`（首页 9 个分类卡片）
3. `src/pages/category/[id].astro` 第 28 行 `<span class="name-en">{category.name_en}</span>`（9 个分类详情页 h1）
4. Project 详情页的 `description` 字段（数据驱动，多为英文）—— 本轮暂不处理，需语言检测

**影响**：屏幕阅读器（VoiceOver/NVDA/JAWS）以中文语音引擎朗读英文内容，发音错误且不可理解。例如 "Weaving" 会被读作"威亚ving"，"Frontend Framework" 会被读作"夫隆特恩德 夫拉姆沃克"。

**WCAG 3.1.2 Language of Parts (Level A) 要求**：页面内与页面主语言不同的短语/段落必须标注 `lang` 属性。

**修复**：3 处显式英文内容加 `lang="en"`：

```astro
<!-- src/pages/index.astro -->
<p class="slogan-en" lang="en">Weaving the GitHub galaxy onto one scroll.</p>

<!-- src/components/CategoryList.astro -->
<span class="name-en" lang="en">{c.name_en}</span>

<!-- src/pages/category/[id].astro -->
<span class="name-en" lang="en">{category.name_en}</span>
```

**关于品牌名**：`Vegavellum` 和 `GitHub` 是专有名词，跨语言通用，WCAG 3.1.2 允许不标注（属"语言不可确定"或"专有名词"豁免）。

**关于数据驱动内容**：project.description 可能是英文或中文，自动语言检测超出 MVP 范围。未来可用 `descriptionLang` 字段或 `language` 字段推断，属正式开发阶段增强。

## MVP 回归验证

```bash
ASTRO_TELEMETRY_DISABLED=1 npm run validate
# ✓ 数据校验通过

ASTRO_TELEMETRY_DISABLED=1 npm run build
# ✓ 16 page(s) built in 469ms

grep -o 'lang="en"' dist/index.html dist/category/dev-tools/index.html
# 验证产物中 lang="en" 已正确写入（首页 9 处 + 分类页 1 处）
```

无回归。

## 子目标深度演进

R13 后，6 子目标状态：
1. 数据完整性 — 深+
2. 路由正确性 — 深+
3. **可访问性 — 深-**（从"中+"升级，覆盖 WCAG 2.4.1 skip-link + 3.1.2 Language of Parts，接近"深"）
4. SEO/元数据 — 深+
5. 部署链路 — 深+
6. 可扩展性 — 深

## 模式总结：a11y 深度演进

R7（skip-link）→ R13（Language of Parts）的 a11y 深度推进：

| 轮次 | WCAG 条款 | Level | 修复 |
|------|----------|-------|------|
| R7 | 2.4.1 Bypass Blocks | A | skip-link |
| R13 | 3.1.2 Language of Parts | A | 英文内容 lang="en" |

剩余 a11y 候选（Level A/AA）：
- 2.4.7 Focus Visible (AA) — focus 样式可见，但未显式定义 :focus-visible
- 1.4.11 Non-text Contrast (AA) — icon 对比度
- 4.1.2 Name, Role, Value — 交互元素 ARIA 标注完整性

## 下一轮候选（R14 审计输入）

R13 完成后剩余候选：
- **ProjectCard 未显示官网链接**：url 字段在详情页显示但卡片不显示，Horizontal gap
- **Project 详情页"返回首页"应为面包屑**：返回所属分类更合理，UX gap
- **WCAG 2.4.7 Focus Visible**：未显式定义 :focus-visible 样式
- **og:image 缺失**：社交分享无预览图（需图片资源，MVP 可能跳过）
