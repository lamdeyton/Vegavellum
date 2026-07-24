# R7：skip-link 补全 WCAG 2.4.1 Level A

> 触发：R6 后继续三类审计。子目标 3（可访问性）长期停留在"中"。Vertical/Horizontal/Connection 三类审计在数据层/SEO 层已无真实 gap，但 a11y 的 Level A 基线仍有缺失：站点无 skip-link，键盘用户需在每页 Tab 10 次（brand + 9 分类链接）才能到达主内容。
>
> skip-link 是 WCAG 2.4.1 Bypass Blocks（Level A，a11y 最低门槛），不是"深度 a11y"。这是 MVP 范围内的真实 gap，可证伪。

## 审计发现

### N1（Vertical · 可访问性）：无 skip-link，违反 WCAG 2.4.1 Level A

**症状**：[src/layouts/Base.astro](file:///Users/lamdeyton/Library/Application%20Support/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a6300d9dbe95cc4e806642c/src/layouts/Base.astro) 的 `<body>` 第一个元素是 `<header>`，无 skip-to-content 链接。header 含 brand + 9 个分类导航，在全部 16 页重复。

**后果**：
- 键盘用户每页需 Tab 10 次才能越过导航到达 `<main>` 主内容
- 违反 WCAG 2.4.1 Bypass Blocks（Level A 是 a11y 最低合规门槛）
- 屏幕阅读器用户每页需逐项听完整导航才能进入正文

**对比验证**：颜色对比度已通过 WCAG AA（R7 审计时计算：--text-muted #5a6072 on --bg #f7f7f9 ≈ 5.7:1 ≥ 4.5:1；导航 #c9c9e0 on --header-bg #14132b ≈ 10.9:1）。html lang、header/main/footer landmark、aria-label 均已具备。唯一缺的 Level A 基线项就是 skip-link。

**修复**：
1. Base.astro `<body>` 首元素加 `<a href="#main-content" class="skip-link">跳到主内容</a>`
2. `<main>` 加 `id="main-content"`
3. CSS：skip-link 默认 `position:absolute; top:-100px`（视觉隐藏），`:focus` 时 `top:0`（键盘聚焦显现）

## 过程中的真实 bug

### E1：同文件并行 Edit 竞态导致 skip-link `<a>` 丢失

**症状**：第一轮实现时，我对 Base.astro 同时发起两个 Edit（一个加 `<a>` skip-link，一个给 `<main>` 加 id）。两个 Edit 都报告成功，但构建产物中 `<a>` 元素消失，只剩 CSS 和 main 的 id。

**根因**：两个 Edit 并行作用于同一文件，第二个 Edit 读取的是原始文件内容（不含第一个 Edit 的 `<a>`），写回时覆盖了第一个 Edit 的结果。CSS 是后续单独 Edit 的，未受影响，所以出现"CSS 在、元素不在"的诡异现象。

**验证**：读源码确认 `<body>` 后直接是 `<header>`，`<a>` 确实缺失。

**修复**：串行重新执行加 `<a>` 的 Edit，构建后验证 `<a href="#main-content" class="skip-link">` 出现在全部 16 页产物中。

**教训**：同一文件的多个 Edit 必须串行，不能并行。并行 Edit 只适用于不同文件。

## MVP 回归验证

```
ASTRO_TELEMETRY_DISABLED=1 npm run build
  ✓ 16 page(s) built in 568ms

skip-link 渲染验证（全部 16 页通过 Base.astro 布局）：
  ✓ dist/index.html              <a href="#main-content" class="skip-link">跳到主内容</a>
  ✓ dist/404.html                含"跳到主内容"
  ✓ dist/category/cli/index.html 含"跳到主内容"
  ✓ dist/project/nextjs/index.html 含"跳到主内容"
  ✓ <main id="main-content"> 存在，href 目标有效

npm run validate
  ✓ 0 错误 0 警告
```

## 子目标进展

| 子目标 | R6 后 | R7 后 |
|--------|-------|-------|
| 1. 数据完整性 | 深+ | 深+ |
| 2. 路由正确性 | 深 | 深 |
| 3. 可访问性 | 中 | **中+**（skip-link 补全 WCAG 2.4.1 Level A；颜色对比度已 AA） |
| 4. SEO/元数据 | 深+ | 深+ |
| 5. 部署链路 | 深 | 深 |
| 6. 可扩展性 | 深 | 深 |

**子目标 3 的诚实评估**：R7 后从"中"升到"中+"。已具备：skip-link（2.4.1）、lang（3.1.1）、landmark roles（1.3.1）、aria-label（1.3.1）、颜色对比度 AA（1.4.3）。要达到"深"仍需：focus-visible 样式（2.4.7）、可能的 ARIA 标签扩展、屏幕阅读器实测。这些属正式开发阶段的 a11y 打磨，不在 MVP demo 范围。

## 下轮计划

R7 后数据层 / SEO 层 / a11y Level A 基线均已覆盖。下一轮审计重点：
- 构建产物是否有孤儿文件
- 部署链路（deploy.yml）是否与 mvp-demo 阶段实际匹配
- 若三类审计 0 gap → 诚实停止，移交正式开发
