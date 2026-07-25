# R44：data.ts 渲染层运行时防御（R36/R41 vertical + connection gap 修复）

## 触发（外部压力）

R43 完成文档同步后启动 R44 三类审计，发现 validator 层与 data 读取层的契约执行不同步：

- **R36** 给 validator 加了 Project 顶层 null/非对象防御（`for (const { file, data: p } of projects)` 循环内 `if (p === null)` 报错）
- **R41** 给 validator 加了 categories.yaml 顶层 null/非数组防御（删除 `parseYaml(categoriesRaw) ?? []` 静默兜底）
- **但 `src/lib/data.ts`** 的实际数据读取代码仍使用 `parse(raw) as Category[]` / `parse(raw) as Project`——TypeScript 类型断言仅在编译时有效，运行时无任何验证

**关键洞察**：validator 只在 CI 中运行（`npm run validate` 在 `.github/workflows/deploy.yml` 中），dev 模式（`npm run dev`）不跑 validator。data.ts 是渲染层最后的守门员，validator 通过 ≠ 渲染层安全。

## Gap 描述

### Gap 1：`getAllCategories()` 缺 R41 同型防御（vertical + connection）

```typescript
// 修复前
export function getAllCategories(): Category[] {
  const raw = readFileSync(join(dataDir, 'categories.yaml'), 'utf8');
  return parse(raw) as Category[];  // ← 类型断言，运行时无效
}
```

**攻击场景**（dev 模式）：
1. 贡献者本地 clone 仓库
2. 误将 `data/categories.yaml` 清空（如合并冲突解决错误）
3. 运行 `npm run dev`（不跑 validator）
4. `parse('')` 返回 null
5. `null as Category[]` 仍是 null
6. 调用方 `index.astro` 第 6 行 `const categories = getAllCategories()` → 第 64 行 `<CategoryList categories={categories} />` → CategoryList 第 14 行 `categories.map()` → **TypeError: Cannot read properties of null (reading 'map')**
7. 整站无法渲染，dev 服务器崩溃，错误信息不可读

**R41 修复后的 validator 行为**：CI 中 `npm run validate` 会报错"categories.yaml 为空或仅含注释"，但 dev 模式不跑 validator，问题暴露不到。

### Gap 2：`getAllProjects()` 缺 R36 同型防御（vertical + connection）

```typescript
// 修复前
export function getAllProjects(): Project[] {
  const files = readdirSync(projectsDir).filter((f) => f.endsWith('.yaml'));
  const projects = files.map((file) => {
    const raw = readFileSync(join(projectsDir, file), 'utf8');
    return parse(raw) as Project;  // ← 类型断言，运行时无效
  });
  return projects.filter((p) => p.status === 'published');  // ← null.status TypeError
}
```

**攻击场景**（dev 模式）：
1. 贡献者新建 `data/projects/my-project.yaml` 但忘记写内容（保存空文件）
2. 运行 `npm run dev`
3. `parse('')` 返回 null
4. `null as Project` 仍是 null
5. `projects` 数组含 null 元素
6. `.filter(p => p.status === 'published')` → `null.status` → **TypeError: Cannot read properties of null (reading 'status')**
7. 整站无法渲染，单个空文件导致全站崩溃

## 修复

### 修复 1：`getAllCategories()` 加 R41 同型防御

```typescript
export function getAllCategories(): Category[] {
  const raw = readFileSync(join(dataDir, 'categories.yaml'), 'utf8');
  const parsed = parse(raw);
  // R44：R41 同型遗漏修复。validator 只在 CI 中运行，dev 模式不跑 validator。
  // data.ts 是渲染层最后的守门员，必须做运行时防御。
  if (parsed === null || parsed === undefined) {
    console.error('[Vegavellum] categories.yaml 为空或仅含注释（YAML 解析为 null）。请运行 `npm run validate` 检查数据格式。');
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.error(`[Vegavellum] categories.yaml 顶层必须是数组（YAML sequence），当前类型为 ${typeof parsed}。请运行 \`npm run validate\` 检查数据格式。`);
    return [];
  }
  return parsed as Category[];
}
```

### 修复 2：`getAllProjects()` 加 R36 同型防御

```typescript
export function getAllProjects(): Project[] {
  const files = readdirSync(projectsDir).filter((f) => f.endsWith('.yaml'));
  const projects = files.map((file) => {
    const raw = readFileSync(join(projectsDir, file), 'utf8');
    return parse(raw);
  });
  // 报告无效条目，指引运行 validator
  for (const p of projects) {
    if (p === null || p === undefined || typeof p !== 'object' || Array.isArray(p)) {
      console.error(`[Vegavellum] 检测到空文件或非对象项目数据（类型：${p === null ? 'null' : Array.isArray(p) ? 'array' : typeof p}）。请运行 \`npm run validate\` 检查 data/projects/ 下所有 YAML 文件。`);
    }
  }
  // 过滤无效条目，避免单文件错误导致整站不可渲染
  const validProjects = projects.filter(
    (p): p is Project => p !== null && p !== undefined && typeof p === 'object' && !Array.isArray(p)
  );
  return validProjects.filter((p) => p.status === 'published');
}
```

## MVP 回归验证

### 正常数据回归

```
npm run validate  → ✓ 0 错误 0 警告（5 项目 9 分类）
npm run build     → ✓ 16 页面构建成功
```

### 攻击样本验证（CRITICAL）

**测试方法**：临时清空 `data/categories.yaml` 和 `data/projects/nextjs.yaml`，运行 build，验证防御性检查生效。

**修复前行为**（推断）：
- `parse('') as Category[]` 返回 null
- `categories.map()` → TypeError: Cannot read properties of null
- build 失败，错误信息不可读

**修复后行为**（实测）：
```
[Vegavellum] categories.yaml 为空或仅含注释（YAML 解析为 null）。请运行 `npm run validate` 检查数据格式。
[Vegavellum] 检测到空文件或非对象项目数据（类型：null）。请运行 `npm run validate` 检查 data/projects/ 下所有 YAML 文件。
10:34:12 [build] 6 page(s) built in 411ms
10:34:12 [build] Complete!
```

- ✓ 无 TypeError 崩溃
- ✓ 错误日志清晰指引运行 `npm run validate`
- ✓ build 完成（生成 6 页：首页 + 404 + 4 项目页，category 页因 categories 空无静态路径，nextjs 项目页因数据被过滤而跳过）
- ✓ 单文件错误不导致整站不可渲染

恢复数据后再次验证：✓ 0 错误 + 16 页面构建成功。

## 教训（validator vs 渲染层职责分离模式）

**vertical + connection gap 模式确立**：

1. **validator 是 CI 守门员，data.ts 是渲染层守门员**：两层职责不同，不可互相替代。validator 在 CI 中 fail-fast 拦截契约违例；data.ts 在 dev/SSG 渲染时做运行时防御，避免单文件错误导致整站崩溃。R36/R41 只完成了 validator 层，data.ts 读取层是同型遗漏。

2. **TypeScript 类型断言不是运行时验证**：`parse(raw) as Category[]` 仅在编译时生效，运行时 `parse('')` 返回 null，`null as Category[]` 仍是 null。类型断言是"告诉编译器相信我"，不是"运行时检查"。运行时验证必须显式写 `if (parsed === null)` / `Array.isArray(parsed)`。

3. **dev 模式是 validator 盲区**：`npm run dev` 不跑 validator，贡献者本地开发时的数据错误只能由渲染层捕获。data.ts 必须假设"输入数据可能违例"，做防御性编程。

4. **静默 fallback vs 显式报错**：R41 修复 validator 时确立了"`?? []` 是静默掩盖契约违例"模式。R44 在 data.ts 中采用"显式 console.error + 返回 []"——既不静默（用户能看到错误指引），又不崩溃（build 继续，单文件错误不阻塞其他页面渲染）。这是渲染层防御的正确模式，区别于 validator 层的"fail-fast 阻塞 CI"。

5. **同型对齐审计的纵向扩展**：R36/R37/R38/R41 的同型对齐聚焦于"validator 内部不同访问路径"。R44 将同型对齐扩展到"validator 层 ↔ data.ts 读取层"——validator 加的防御性检查，data.ts 读取层也需同型对齐。三层防御闭环：validator（CI）+ data.ts（渲染）+ TypeScript interface（编译时类型）。

**渲染层防御模式确立**：
- 不静默 fallback（必须有 console.error 指引）
- 不崩溃（返回空集合让 build 继续）
- 错误信息指引 validator（"请运行 `npm run validate`"）
- 单文件错误不阻塞其他有效数据（filter 而非 throw）

## 文件变更

- `src/lib/data.ts`：`getAllCategories()` 加 R41 同型 null/非数组防御；`getAllProjects()` 加 R36 同型 null/非对象防御 + 过滤无效条目。
- `iterations/README.md`：新增 R44 条目 + R44 列到 6 子目标演进表。
- `iterations/44-data-layer-runtime-defense.md`：本文件。
