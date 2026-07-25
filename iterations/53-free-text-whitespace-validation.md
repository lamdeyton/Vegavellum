# R53: free-text 字段前后空格校验（R37/R52 同型补全，Horizontal gap 修复）

**轮次**: R53
**日期**: 2026-07-24
**主题**: Horizontal 审计发现所有 free-text 字段（Project 4 个 + Category 5 个）缺少前后空格校验，与 repo/url 字段校验不一致
**状态**: 已完成
**相关模式**: R37, R52, R31

## 背景

R37 为 free-text 字段（name/description/license/language + Category 5 字段）添加了纯空白字符串校验（`trim() === ''`），但遗漏了前后空格校验（`value !== value.trim()`）。

R52 发现 url 字段有同样的 gap 并修复。R51 发现 repo 字段有空段 gap。

## Gap 发现

### Horizontal 审计

| 字段 | 类型 | 必填 | 空字符串校验 | 纯空白校验 (R37) | 前后空格校验 | 格式/内容校验 |
|------|------|------|-------------|-----------------|-------------|--------------|
| name | string | ✓ | 隐式 (truthy) | ✓ | ✗ | 无 |
| description | string | ✓ | 隐式 (truthy) | ✓ | ✗ | 无 |
| repo | string | ✓ | ✓ | ✓ (隐式: split 非空) | ✓ (R37) | owner/repo 格式 |
| url | string | ✗ | ✓ | ✓ (R52) | ✓ (R52) | URL 格式 + 协议白名单 |
| license | string | ✗ | ✓ | ✓ | ✗ | SPDX canonical |
| language | string | ✗ | ✓ | ✓ | ✗ | 无 |
| tags | string[] | ✗ | ✓ (空数组) | ✓ (元素级) | ✗ (元素级) | URL-friendly |
| sources | string[] | ✗ | ✓ (空数组) | ✓ (元素级) | ✗ (元素级) | 枚举校验 |
| Category.id | string | ✓ | ✓ | ✓ | ✗ | URL-friendly |
| Category.name | string | ✓ | 隐式 | ✓ | ✗ | 无 |
| Category.name_en | string | ✓ | 隐式 | ✓ | ✗ | 无 |
| Category.icon | string | ✓ | 隐式 | ✓ | ✗ | 无 |
| Category.description | string | ✓ | 隐式 | ✓ | ✗ | 无 |

**Gap**: name/description/license/language + Category 5 字段 = 9 个字段缺少前后空格校验，与 repo/url 字段校验不一致。

## 攻击向量验证

构造攻击样本 `r53-attack-sample.yaml`：

```yaml
name: " Astro "
description: " The web framework "
license: " MIT "
language: " TypeScript "
url: " https://astro.build "
repo: " withastro/astro "
```

验证结果（修复前）：
- repo 和 url 字段的前后空格被正确拦截（R37/R52 已有）
- name/description/license/language 的前后空格**静默通过**，未报错

Category 同样构造验证：
- `name: " 前端框架 "` 静默通过
- `name_en: " Frontend Framework "` 静默通过

## 影响分析

| 字段 | 渲染位置 | 影响 |
|------|---------|------|
| name | 项目标题、卡片标题、SEO title | 标题前后有空格，不美观，SEO 可能受影响 |
| description | 项目描述、卡片描述、meta description | 描述前后有空格，不美观 |
| license | 项目详情页 badge | badge 文字前后有空格，视觉不对齐 |
| language | 项目卡片 badge、详情页 badge | badge 文字前后有空格，视觉不对齐 |
| Category.name | 分类页标题、导航菜单 | 分类名前后有空格，不美观 |
| Category.name_en | 分类页子标题 | 英文名前后有空格，不美观 |
| Category.icon | 分类卡片 emoji | 前后空格 + emoji 渲染异常 |
| Category.description | 分类页描述 | 描述前后有空格，不美观 |

## 修复方案

### validator 侧

为以下字段添加前后空格校验（`value !== value.trim()`）：

1. **Project**:
   - name / description（必填 free-text）
   - license / language（可选 free-text）

2. **Category**:
   - id / name / name_en / icon / description（全部 5 个字符串字段）

### 防御性条件

- SPDX 校验：如果 license 有前后空格，跳过 SPDX 校验，避免报"不在 SPDX 列表中"的误导性错误（R31 模式：空性/格式错误优先于内容校验）
- URL-friendly 校验：如果 Category.id 有前后空格，跳过 URL-friendly 校验，避免冗余错误

### 同型对齐

| 字段组 | 空字符串 | 纯空白 (trim==='') | 前后空格 (value!==trim) | 格式/内容 |
|--------|---------|-------------------|----------------------|----------|
| 数字段 (slug/repo 等) | ✓ | ✓ (隐式) | ✓ | ✓ |
| Project free-text 必填 | 隐式 | ✓ | ✓ (R53) | - |
| Project free-text 可选 | ✓ | ✓ | ✓ (R53) | ✓ (license SPDX) |
| Project 数组元素 | ✓ (空数组) | ✓ (元素级) | ✗ (TODO: R54?) | ✓ (tags url-friendly, sources 枚举) |
| Category 5 字段 | 隐式/✓ | ✓ | ✓ (R53) | ✓ (id URL-friendly) |

## 验证

### 攻击样本验证

修复后，攻击样本触发 6 个错误（name/description/repo/url/license/language 各一个），均为"含前导/尾部空格"错误。

License SPDX 校验被跳过，没有报"不在 SPDX 列表中"的误导性错误。

Category 攻击样本触发 2 个错误（name/name_en），URL-friendly 校验被跳过。

### MVP 回归测试

```
$ npm run validate
错误：0
警告：0
✓ 数据校验通过。

$ npm run build
16 page(s) built in 529ms
✓ build 完成
```

## 模式确立

### 同型字段不一致处理模式（再次确认）

同类型字段（如所有 free-text 字符串字段）应使用相同校验逻辑，跨 interface（Project/Category）及必填/可选字段间需保持校验一致性。

### R31 模式扩展：格式校验假设干净字符串

后续内容/格式校验（如 SPDX canonical、URL-friendly）应假设输入字符串是"干净的"（无前后空格）。如果输入有前后空格，跳过后续校验，避免误导性错误信息。

### 攻击样本验证模式（再次确认）

通过构造非法 YAML 数据验证 validator 是否能正确捕获错误，确保防御性检查完整有效。

## 下一步

- **R54**: 数组元素级前后空格校验（tags/sources 元素是否需要 trim 校验？）
- **R55**: 继续 vertical/horizontal/connection/security 四维审计
- **R56**: 渲染层防御同型对齐——data.ts 是否也需要对所有 free-text 字段做 trim 防御？
