# R16 — WCAG 2.4.7 Focus Visible 显式焦点环

> 超长程任务模式第十六轮。继续 a11y 深度演进，补全键盘导航焦点指示器。

## 触发原因

R15 完成后继续 a11y 审计。R13 已修复 WCAG 3.1.2 (Level A)，本轮处理 WCAG 2.4.7 Focus Visible (Level AA) —— 之前在 iterations/README.md 标注为"正式开发阶段 a11y 打磨"，但用户要求继续深度迭代，且修复成本低（纯 CSS），应在 MVP demo 阶段完成。

## 审计发现

### N1（Horizontal · 可访问性）：未显式定义 :focus-visible 样式

**症状**：
- `Base.astro` 全局样式无 `:focus` 或 `:focus-visible` 规则（除 `.skip-link:focus`）
- 依赖浏览器默认 outline，但：
  - 不同浏览器默认 outline 表现不一（颜色/粗细/偏移）
  - 深色 header 上的链接默认 outline 可能不可见
  - 卡片链接（.cat-item, .card-title a）的 outline 在圆角边框上表现差

**影响**：键盘用户（Tab 键导航）的焦点指示器不一致，某些情况下难以辨识当前焦点位置，违反 WCAG 2.4.7 Focus Visible (Level AA)。

**修复**：在全局样式中添加 `:focus-visible` 规则：

```css
/* WCAG 2.4.7 Focus Visible (AA)：键盘聚焦时显示焦点环 */
a:focus-visible,
button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
}

/* skip-link 的 focus 样式保持原有滑动效果，覆盖全局 focus-visible */
.skip-link:focus {
  outline: none;
}
```

**设计取舍**：
- 用 `:focus-visible` 而非 `:focus`：只在键盘聚焦时触发，鼠标点击不显示焦点环（现代浏览器支持，避免干扰鼠标用户）
- 用 `outline` 而非 `box-shadow`：outline 不影响布局，且浏览器兼容性最好
- 颜色用 `var(--accent)`（紫色 #5b21b6）：与品牌色一致，在浅色背景和深色 header 上都可见
- `outline-offset: 2px`：焦点环与元素之间留间隙，避免遮挡内容
- skip-link 特殊处理：保持原有 `top: 0` 滑动效果，移除 outline（已有明显的视觉变化）

## MVP 回归验证

```bash
ASTRO_TELEMETRY_DISABLED=1 npm run build
# ✓ 16 page(s) built in 484ms

grep -c "focus-visible" dist/index.html
# 1（全局样式已注入）
```

构建无回归。

## 子目标深度演进

R16 后，6 子目标状态：
1. 数据完整性 — 深+
2. 路由正确性 — 深+
3. **可访问性 — 深**（从"深-"升级，覆盖 WCAG 2.4.1 + 3.1.2 + 2.4.7，达"深"水平）
4. SEO/元数据 — 深+
5. 部署链路 — 深+
6. 可扩展性 — 深

## a11y 深度演进总结

R7/R13/R16 三轮 a11y 专项迭代，从"未涉及"推进到"深"：

| 轮次 | WCAG 条款 | Level | 修复 | 影响 |
|------|----------|-------|------|------|
| R7 | 2.4.1 Bypass Blocks | A | skip-link | 键盘用户跳过 header |
| R13 | 3.1.2 Language of Parts | A | lang="en" | 屏幕阅读器正确语音 |
| R16 | 2.4.7 Focus Visible | AA | :focus-visible | 键盘焦点指示器一致 |

**当前 a11y 覆盖**：
- WCAG 2.4.1 (A) ✓
- WCAG 3.1.2 (A) ✓
- WCAG 2.4.7 (AA) ✓
- WCAG 1.4.3 Contrast (AA) ✓（颜色对比度已达标）
- WCAG 4.1.2 Name, Role, Value ✓（aria-label/landmark 完整）

**剩余 a11y 候选**（属打磨级，非 MVP 必须）：
- WCAG 1.4.11 Non-text Contrast (AA) — icon 对比度
- WCAG 2.4.13 Focus Appearance (AAA) — 焦点环粗细（2.4.7 已满足 AA，AAA 非必须）
- 屏幕阅读器实测

## 下一轮候选（R17 审计输入）

R16 完成后剩余候选（边际递减）：
- **og:image 缺失**：社交分享无预览图（需图片资源）
- **ProjectCard tags 截断**：tags 过多时无截断
- **astro check 类型检查**：未纳入 CI
- **sitemap lastmod 缺失**：SEO 微优化
