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

/** 读取并解析全部分类定义。 */
export function getAllCategories(): Category[] {
  const raw = readFileSync(join(dataDir, 'categories.yaml'), 'utf8');
  return parse(raw) as Category[];
}

/** 读取全部已发布项目（status === 'published'）。 */
export function getAllProjects(): Project[] {
  const files = readdirSync(projectsDir).filter((f) => f.endsWith('.yaml'));
  const projects = files.map((file) => {
    const raw = readFileSync(join(projectsDir, file), 'utf8');
    return parse(raw) as Project;
  });
  return projects.filter((p) => p.status === 'published');
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
