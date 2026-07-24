# 贡献指南

感谢你对 Vegavellum 的关注！这是一个社区驱动的开源项目索引，欢迎通过 PR 提名优质项目。

## 如何提名一个项目

### 1. 创建项目数据文件

在 `data/projects/` 下新建一个 YAML 文件，**文件名必须与 `slug` 字段一致**。

例如 `data/projects/my-project.yaml`：

```yaml
# 必填字段
name: My Project              # 项目名称
slug: my-project              # URL 友好的唯一标识（必须与文件名一致）
repo: owner/repo              # GitHub 仓库，owner/repo 格式
description: A brief one-line description
category: dev-tools           # 必须存在于 data/categories.yaml 的 id

# 可选字段
url: https://my-project.dev   # 官网（无则省略，默认用 GitHub repo）
license: mit                  # SPDX 标识符
tags: [cli, rust, search]     # 技术标签
language: Rust                # 主语言

# 元数据（贡献者填写以下两项，其余自动维护）
addedAt: 2026-07-24           # 收录日期（YYYY-MM-DD）
status: pending               # 新提名统一用 pending，维护者审核后改为 published
```

### 2. 选择分类

分类 id 必须与 `data/categories.yaml` 中的 `id` 字段匹配。当前分类：

| id | 名称 |
|----|------|
| `frontend-framework` | 前端框架 |
| `backend-framework` | 后端框架 |
| `dev-tools` | 开发工具 |
| `ai-ml` | AI / 机器学习 |
| `database` | 数据库 |
| `devops` | 运维 / 部署 |
| `security` | 安全 |
| `cli` | 命令行工具 |
| `libraries` | 通用库 |

### 3. 本地验证

提交 PR 前请先本地验证：

```bash
# 安装依赖（首次）
npm install

# 数据校验（检查必填字段、category 引用、slug 文件名一致性等）
npm run validate

# 本地预览
npm run dev
# 访问 http://localhost:4321/Vegavellum

# 构建验证
ASTRO_TELEMETRY_DISABLED=1 npm run build
```

### 4. 提交 PR

- 分支命名：`add-<slug>`（如 `add-ripgrep`）
- PR 标题：`add: <项目名>`
- PR 描述请简要说明为什么该项目值得收录

## 收录标准

维护者审核时会考虑：

- **活跃度**：近半年有提交
- **社区认可**：stars 数量、贡献者数量
- **文档质量**：README 完整、有使用说明
- **许可证**：必须是 OSI 认可的开源许可证
- **独特性**：与已收录项目有差异化，非简单重复

## 项目状态说明

| status | 含义 |
|--------|------|
| `pending` | 新提名，等待维护者审核 |
| `published` | 已审核通过，在站点显示 |
| `rejected` | 未通过审核（PR 中会说明原因） |

## 开发环境

```bash
# 克隆仓库
git clone git@github.com:lamdeyton/Vegavellum.git
cd Vegavellum

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建产物
npm run preview
```

## 技术栈

- [Astro 4](https://astro.build/) — 静态站点生成器
- YAML — 项目数据存储
- GitHub Actions — CI/CD
- GitHub Pages — 部署

## 许可证

本项目采用 [MIT License](./LICENSE)。
