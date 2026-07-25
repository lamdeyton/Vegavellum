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

/**
 * R49：url 协议白名单渲染层防御（R48 同型遗漏，dev 模式下 validator 不跑）。
 *
 * R48 在 validator 中加了 url 协议白名单（只允许 http/https），但 validator 只在 CI 中运行，
 * dev 模式（npm run dev）不跑 validator。攻击向量：贡献者 PR 含 `url: "javascript:alert(1)"`，
 * 开发者拉取 PR 本地测试 → dev 模式通过 data.ts（无字段校验）→ ProjectCard/[slug].astro
 * 渲染 `<a href="javascript:alert(1)">` → 点击触发 XSS。
 *
 * 与 R44-R46 渲染层防御模式同型对齐：validator（CI 守门员）+ data.ts（渲染层守门员）。
 * 不静默 fallback：非法协议 console.error 报告 + 返回 undefined（让渲染层 `project.url &&` 跳过）。
 *
 * @param url 原始 url 字段值（可能为任意类型：undefined/string/number/array/object）
 * @param slug 项目 slug，用于错误信息定位（可能为 undefined，回退到 '(unknown)'）
 * @returns 通过协议白名单的 url 字符串，或 undefined（非法时）
 */
function sanitizeProjectUrl(url: unknown, slug: string | undefined): string | undefined {
  // 字段不存在或 null 视为未提供，渲染层 `project.url &&` 自然跳过
  if (url === undefined || url === null) return undefined;
  // 类型校验：非字符串的 url（数组/对象/数字）无法用于 href，直接忽略
  if (typeof url !== 'string') {
    console.error(`[Vegavellum] 项目 ${slug || '(unknown)'}: url 字段类型错误（${typeof url}），已忽略该字段。请运行 \`npm run validate\` 检查数据格式。`);
    return undefined;
  }
  // 空字符串：与字段省略语义不同（贡献者显式写空字符串是误写），validator 会 fail，渲染层忽略
  if (url === '') {
    console.error(`[Vegavellum] 项目 ${slug}: url 为空字符串，已忽略该字段。请运行 \`npm run validate\` 检查数据格式。`);
    return undefined;
  }
  try {
    const parsed = new URL(url);
    // R48 同型对齐：协议白名单只允许 http/https，防 javascript:/data:/vbscript: XSS 注入
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      console.error(`[Vegavellum] 项目 ${slug}: url "${url}" 协议 "${parsed.protocol}" 不在白名单 {http, https} 内（防 XSS 注入），已忽略该字段。请运行 \`npm run validate\` 检查数据格式。`);
      return undefined;
    }
    return url;
  } catch {
    console.error(`[Vegavellum] 项目 ${slug}: url "${url}" 不是合法 URL，已忽略该字段。请运行 \`npm run validate\` 检查数据格式。`);
    return undefined;
  }
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
  return validProjects
    .filter((p) => p.status === 'published')
    // R49：url 协议白名单渲染层防御（R48 同型遗漏补全，dev 模式下 validator 不跑）
    // 非法协议 url（如 javascript:alert(1)）会被 sanitizeProjectUrl 过滤为 undefined，
    // 渲染层 `project.url &&` 自然跳过，避免生成可点击的 XSS 链接。
    // 不静默 fallback：console.error 报告非法 url，指引运行 validator 修复源数据。
    .map((p) => ({ ...p, url: sanitizeProjectUrl(p.url, p.slug) }));
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
