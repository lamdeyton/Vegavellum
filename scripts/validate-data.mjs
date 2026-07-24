// 数据校验脚本：检查 data/ 目录下 YAML 数据的契约一致性。
// 在 CI 中于 build 之前运行，发现契约违例立即失败。
//
// 校验项：
//   B3  category id 引用：每个项目的 category 必须存在于 categories.yaml
//   B4  slug vs 文件名：data/projects/<slug>.yaml 内部的 slug 字段必须与文件名一致
//   B5  pending/rejected 项目：警告（不失败），提示贡献者
//   必填字段：name/slug/repo/description/category/addedAt/status
//   枚举值：status ∈ {published, pending, rejected}
//   repo 格式：owner/repo（单个斜杠）

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
const projectsDir = join(dataDir, 'projects');

let errorCount = 0;
let warnCount = 0;

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  errorCount++;
}

function warn(msg) {
  console.warn(`  ⚠ ${msg}`);
  warnCount++;
}

// --- 加载数据 ---
const categoriesRaw = readFileSync(join(dataDir, 'categories.yaml'), 'utf8');
const categories = parseYaml(categoriesRaw) ?? [];
const categoryIds = new Set(categories.map((c) => c.id));

const projectFiles = readdirSync(projectsDir).filter((f) => f.endsWith('.yaml'));
const projects = projectFiles.map((file) => {
  const raw = readFileSync(join(projectsDir, file), 'utf8');
  return { file, data: parseYaml(raw) };
});

console.log(`\n校验 ${projects.length} 个项目文件、${categories.length} 个分类\n`);

// --- 校验分类定义 ---
console.log('▸ 分类定义');
const seenCatIds = new Set();
for (const c of categories) {
  if (!c.id) fail(`分类缺少 id 字段: ${JSON.stringify(c)}`);
  if (seenCatIds.has(c.id)) fail(`分类 id 重复: ${c.id}`);
  seenCatIds.add(c.id);
  if (!c.name) fail(`分类 ${c.id} 缺少 name`);
  if (!c.name_en) fail(`分类 ${c.id} 缺少 name_en`);
  if (!c.icon) fail(`分类 ${c.id} 缺少 icon`);
  if (!c.description) fail(`分类 ${c.id} 缺少 description`);
}

// --- 校验项目 ---
console.log('\n▸ 项目数据');
const seenSlugs = new Set();
const requiredFields = ['name', 'slug', 'repo', 'description', 'category', 'addedAt', 'status'];
const validStatus = new Set(['published', 'pending', 'rejected']);

for (const { file, data: p } of projects) {
  const fileBase = basename(file, '.yaml'); // 去掉 .yaml 扩展名
  const label = `${fileBase}.yaml`;

  // 必填字段
  for (const f of requiredFields) {
    if (p[f] === undefined || p[f] === null || p[f] === '') {
      fail(`${label}: 缺少必填字段 ${f}`);
    }
  }

  // addedAt 日期格式 YYYY-MM-DD（CONTRIBUTING 声明的契约）
  if (p.addedAt && !/^\d{4}-\d{2}-\d{2}$/.test(p.addedAt)) {
    fail(`${label}: addedAt "${p.addedAt}" 不是 YYYY-MM-DD 格式`);
  }

  // B4 slug vs 文件名
  if (p.slug && p.slug !== fileBase) {
    fail(`${label}: slug "${p.slug}" 与文件名 "${fileBase}" 不一致（B4 契约：文件名即 slug）`);
  }

  // slug 唯一
  if (p.slug) {
    if (seenSlugs.has(p.slug)) fail(`${label}: slug "${p.slug}" 重复`);
    seenSlugs.add(p.slug);
  }

  // B3 category 引用
  if (p.category && !categoryIds.has(p.category)) {
    fail(`${label}: category "${p.category}" 不存在于 categories.yaml（B3 引用断裂）`);
  }

  // status 枚举
  if (p.status && !validStatus.has(p.status)) {
    fail(`${label}: status "${p.status}" 不在枚举 {published, pending, rejected} 内`);
  }

  // repo 格式
  if (p.repo && (p.repo.split('/').length !== 2 || p.repo.includes('://'))) {
    fail(`${label}: repo "${p.repo}" 应为 owner/repo 格式`);
  }

  // B5 pending/rejected 警告
  if (p.status === 'pending') {
    warn(`${label}: status=pending，该项目不会在站点上显示，等待维护者审核`);
  } else if (p.status === 'rejected') {
    warn(`${label}: status=rejected，该项目不会在站点上显示`);
  }
}

// --- 汇总 ---
console.log(`\n────────────────────────`);
console.log(`  错误：${errorCount}`);
console.log(`  警告：${warnCount}`);
console.log(`────────────────────────\n`);

if (errorCount > 0) {
  console.error('✗ 数据校验失败，请修复上述错误。');
  process.exit(1);
} else if (warnCount > 0) {
  console.log('✓ 数据校验通过（含警告，不影响构建）。');
} else {
  console.log('✓ 数据校验通过。');
}
