import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', '..', 'data');
const projectsDir = join(dataDir, 'projects');

export interface Category {
  id: string;
  name: string;
  name_en: string;
  icon: string;
  description: string;
}

export interface Project {
  name: string;
  slug: string;
  repo: string;
  description: string;
  category: string;
  url?: string;
  license?: string;
  tags?: string[];
  language?: string;
  addedAt: string;
  status: 'published' | 'pending' | 'rejected';
  /** 收录来源，自动维护字段，贡献者无需填写 */
  sources?: string[];
}

/** sources 枚举值到用户友好中文标签的映射（与 validate-data.mjs 的 validSources 对齐） */
export const SOURCE_LABELS: Record<string, string> = {
  'auto-discovered': '机器人自动发现',
  'community-nominated': '社区 PR 提名',
  'curator-curated': '维护者人工策展',
};

/** 将 sources 枚举值转换为用户友好中文标签，未知值回退到原值（避免未来扩展新枚举时静默破坏）。 */
export function getSourceLabel(s: string): string {
  return SOURCE_LABELS[s] ?? s;
}

/** 读取并解析全部分类定义。 */
export function getAllCategories(): Category[] {
  const raw = readFileSync(join(dataDir, 'categories.yaml'), 'utf8');
  const parsed = parse(raw);
  // R44：R41 同型遗漏修复（vertical + connection gap）。
  // R41 给 validator 加了 categories.yaml 顶层 null/非数组防御，但 validator 只在 CI 中运行，
  // dev 模式（npm run dev）不跑 validator。data.ts 是渲染层最后的守门员，必须做运行时防御。
  // `parse(raw) as Category[]` 是 TypeScript 类型断言，运行时无效——空文件解析为 null，
  // 调用方（index.astro / Base.astro / [id].astro）的 `categories.map()` 会 TypeError 崩溃。
  // 不静默 fallback：明确报错指引运行 `npm run validate`，让用户感知数据问题而非看到空白页。
  if (parsed === null || parsed === undefined) {
    console.error('[Vegavellum] categories.yaml 为空或仅含注释（YAML 解析为 null）。请运行 `npm run validate` 检查数据格式。');
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.error(`[Vegavellum] categories.yaml 顶层必须是数组（YAML sequence），当前类型为 ${typeof parsed}。请运行 \`npm run validate\` 检查数据格式。`);
    return [];
  }
  // R45：R37 同型遗漏修复（element-level defense，R44 top-level 的 friction chain）。
  // R44 修复了顶层 null/非数组，但数组内的 null 元素（`- null`）仍会让调用方崩溃：
  //   [id].astro getStaticPaths() → categories.map(c => ({ params: { id: c.id } })) → null.id TypeError
  // R37 给 validator 加了 Category 元素 null 防御，data.ts 读取层是同型遗漏。
  // 与 getAllProjects() R44 filter 同型对齐：过滤非对象元素 + 报告无效条目指引 validator。
  for (const c of parsed) {
    if (c === null || c === undefined || typeof c !== 'object' || Array.isArray(c)) {
      console.error(`[Vegavellum] 检测到空条目或非对象分类数据（类型：${c === null ? 'null' : Array.isArray(c) ? 'array' : typeof c}）。请运行 \`npm run validate\` 检查 data/categories.yaml。`);
    }
  }
  return parsed.filter(
    (c): c is Category => c !== null && c !== undefined && typeof c === 'object' && !Array.isArray(c)
  );
}

/** 读取全部已发布项目（status === 'published'）。 */
export function getAllProjects(): Project[] {
  const files = readdirSync(projectsDir).filter((f) => f.endsWith('.yaml'));
  const projects = files.map((file) => {
    const raw = readFileSync(join(projectsDir, file), 'utf8');
    return parse(raw);
  });
  // R44：R36 同型遗漏修复（vertical + connection gap）。
  // R36 给 validator 加了 Project 顶层 null/非对象防御，但 validator 只在 CI 中运行。
  // dev 模式下某个项目文件为空时，`parse(raw)` 返回 null，`null as Project` 仍是 null，
  // 后续 `.filter(p => p.status === 'published')` 会在 null 上 TypeError 崩溃。
  // 过滤掉 null/非对象条目，并报错指引运行 validator，避免单文件错误导致整站不可渲染。
  for (const p of projects) {
    if (p === null || p === undefined || typeof p !== 'object' || Array.isArray(p)) {
      console.error(`[Vegavellum] 检测到空文件或非对象项目数据（类型：${p === null ? 'null' : Array.isArray(p) ? 'array' : typeof p}）。请运行 \`npm run validate\` 检查 data/projects/ 下所有 YAML 文件。`);
    }
  }
  const validProjects = projects.filter(
    (p): p is Project => p !== null && p !== undefined && typeof p === 'object' && !Array.isArray(p)
  );
  return validProjects.filter((p) => p.status === 'published');
}

/** 按分类 id 获取已发布项目。 */
export function getProjectsByCategory(categoryId: string): Project[] {
  return getAllProjects().filter((p) => p.category === categoryId);
}

/** 按 slug 获取单个已发布项目，未命中返回 undefined。 */
export function getProjectBySlug(slug: string): Project | undefined {
  return getAllProjects().find((p) => p.slug === slug);
}

/** 按 id 获取单个分类，未命中返回 undefined。 */
export function getCategoryById(id: string): Category | undefined {
  return getAllCategories().find((c) => c.id === id);
}
