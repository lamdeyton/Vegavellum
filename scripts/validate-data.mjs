// 数据校验脚本：检查 data/ 目录下 YAML 数据的契约一致性。
// 在 CI 中于 build 之前运行，发现契约违例立即失败。
//
// 校验项：
//   B3  category id 引用：每个项目的 category 必须存在于 categories.yaml
//   B4  slug vs 文件名：data/projects/<slug>.yaml 内部的 slug 字段必须与文件名一致
//   B5  pending/rejected 项目：警告（不失败），提示贡献者
//   必填字段：name/slug/repo/description/category/addedAt/status
//   枚举值：status ∈ {published, pending, rejected}
//          sources ∈ {auto-discovered, community-nominated, curator-curated}
//   repo 格式：owner/repo（单个斜杠，owner/repo 段均非空，防 "foo/" / "/foo" / "/" 空段）
//   addedAt 格式：YYYY-MM-DD
//   addedAt 日期有效性：必须是真实存在的日期（2026-02-30 / 2026-13-01 / 2026-00-01 等溢出日期不通过）
//   repo 跨项目唯一性：同一 GitHub 仓库不允许被重复收录（大小写不敏感，因 GitHub owner/repo 解析不区分大小写）
//   license 格式：SPDX canonical 形式（已知许可证大小写错误 fail；未知许可证 warn）
//   slug/category id 格式：URL-friendly（^[a-z0-9]+(-[a-z0-9]+)*$）
//   tags 类型：必须是数组，元素必须是字符串（Project interface 契约 tags?: string[]）
//   tags 元素：非空字符串 + 唯一（防 `["cli", ""]` 空标签和 `["cli", "cli"]` 重复标签）
//   sources 元素：非空字符串 + 唯一 + 类型校验（同 tags 同型对齐，防误导性"不在枚举内"错误掩盖类型错误）
//   tags/sources 元素空白字符串：`["   "]` 报错（同 R37 字段级 trim() 空白校验同型对齐，防渲染 `#   ` 空白标签 + 防误导性"不在枚举内"）
//   url 格式：必须是合法 URL（带协议，如 https://example.com）
//   url 协议白名单：只允许 http/https（R48，防 `javascript:` / `data:` / `vbscript:` XSS 注入到 <a href>）
//   url/license/language 类型：必须是字符串（Project interface 契约）
//   可选字段空值：url/license/language 不得为空字符串，tags/sources 不得为空数组（要么不写字段，要么写有效值）
//   Project 必填字段类型：name/slug/repo/description/category/addedAt/status 必须是字符串
//   Category 字段类型：id/name/name_en/icon/description 必须是字符串
//   未知字段：Project/Category YAML 不得含已知字段以外的字段（防 typo 静默通过，如 lisense/tagz/lang/source）
//   Project 顶层防御：null/非对象 YAML（空文件/数组/标量）报错并跳过，避免后续 TypeError 崩溃
//   Category 条目防御：null/非对象元素（`- null` / `- "string"`）报错并跳过，同 Project 同型对齐
//   free-text 空白字符串：name/description（Project）/ id/name/name_en/icon/description（Category）不得为仅含空格的字符串
//   license/language 空白字符串：可选字段不得为仅含空格的字符串（与空字符串校验同型对齐）
//   repo 前后空格：`repo: " owner/repo "` 报错，避免 GitHub URL 含空格 404
//   repo 中间空格：`repo: "owner/re po"` 报错（R37 前后空格校验的同型补全，GitHub owner/repo 不允许任何空格）
//   categoryIds 防御性计算：在 `.map((c) => c.id)` 前过滤非对象元素，避免 `- null` 在循环前崩溃
//   categories.yaml 顶层防御：空文件/非数组（mapping/scalar）报错，避免 `?? []` 掩盖 null 导致 validator 静默通过但渲染层崩溃

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

// 校验 YYYY-MM-DD 字符串是否为真实存在的日期（R34）
// 正则只校验"形如日期"，但 JavaScript 的 new Date(2026, 1, 30) 会溢出到 2026-03-02，
// 因此需用"构造后回读比对"模式：从 Date 反读年/月/日，若与输入不一致说明发生了溢出（如 2-30 → 3-2）
// 注意：必须用本地时区构造（new Date(y, m-1, d)），避免 UTC 时区偏移导致跨日误判
function isValidCalendarDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

// --- 加载数据 ---
const categoriesRaw = readFileSync(join(dataDir, 'categories.yaml'), 'utf8');
// R41：categories.yaml 顶层 null/非数组防御性检查（R36 同型遗漏补全，CRITICAL）
// 原代码 `parseYaml(categoriesRaw) ?? []` 用空数组兜底 null，掩盖了空文件/仅注释文件，
// validator 静默通过（循环不执行、无报错），但 data.ts `getAllCategories()` 返回 null，
// 首页 CategoryList 组件 `.map()` 崩溃。R36 给 Project 单文件加了顶层 null 防御（循环内
// `if (p === null)` 报错），但 categories.yaml 是单文件，`?? []` 掩盖了同型问题。
// 同型对齐 R36：删除 `?? []`，加显式 null/非数组检查，fail 后用 [] 兜底避免后续崩溃。
// 攻击样本：
//   空文件/仅注释 → null → 原代码 `?? []` 掩盖 → 循环不执行，无报错 ❌（R41 修复前）
//   `foo: bar`（顶层 mapping）→ {foo:'bar'} → `for...of` 抛 TypeError 但信息不友好 ❌
//   `"string"`（顶层标量）→ "string" → 迭代字符，c.id 是 undefined，报"缺少 id"误导 ❌
const categoriesParsed = parseYaml(categoriesRaw);
let categories;
if (categoriesParsed === null || categoriesParsed === undefined) {
  fail(`categories.yaml 为空或仅含注释（YAML 解析为 null），请填写分类数据`);
  categories = [];
} else if (!Array.isArray(categoriesParsed)) {
  fail(`categories.yaml 顶层必须是数组（YAML sequence，用 "- " 开头），当前类型为 ${typeof categoriesParsed}，请检查缩进或是否误写为 mapping/scalar`);
  categories = [];
} else {
  categories = categoriesParsed;
}
// R38：categoryIds 防御性计算（CRITICAL，横向审计 gap 修复）
// R37 修复了 `for (const c of categories)` 循环内的 null 崩溃，但漏掉循环**之前**的
// `categories.map((c) => c.id)`——`- null` 仍在此处崩溃（TypeError: Cannot read properties of null）。
// 同型对齐 R36 Project 防御模式：在元素级访问前，对单个元素做防御性 typeof 检查。
// 注意：此处**不**过滤 categories 数组（否则 R37 循环内的报错会失效），
// 只对 categoryIds 计算做 null-safe 处理——非对象元素不贡献 id，但报错仍由 R37 负责。
const categoryIds = new Set(
  categories
    .filter((c) => c !== null && c !== undefined && typeof c === 'object' && !Array.isArray(c))
    .map((c) => c.id)
);

const projectFiles = readdirSync(projectsDir).filter((f) => f.endsWith('.yaml'));
const projects = projectFiles.map((file) => {
  const raw = readFileSync(join(projectsDir, file), 'utf8');
  return { file, data: parseYaml(raw) };
});

console.log(`\n校验 ${projects.length} 个项目文件、${categories.length} 个分类\n`);

// --- 校验分类定义 ---
console.log('▸ 分类定义');
const seenCatIds = new Set();
// URL-friendly 格式：小写字母/数字，可用连字符分隔，无首尾/连续连字符
const urlFriendlyRe = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Category interface 字段类型校验（src/lib/data.ts 声明，与 Project interface 同型）
// 必填字段：id/name/name_en/icon/description 都必须是字符串
const catStringFields = ['id', 'name', 'name_en', 'icon', 'description'];
// Category interface 已知字段集合（R33：拒绝未知字段，防止 typo 静默通过）
// 与 catStringFields 同源，但用 Set 以 O(1) 查找
const knownCategoryFields = new Set(catStringFields);
for (const c of categories) {
  // R37：空条目/非对象防御性检查（同 R36 Project 防御，同型对齐）
  // categories.yaml 中 `- null` 或 `- "string"` 会导致 `!c.id` 抛 TypeError 或连锁误报
  if (c === null || c === undefined) {
    fail(`分类条目为空或仅含注释（YAML 解析为 null），请填写分类数据或删除该条目`);
    continue;
  }
  if (typeof c !== 'object' || Array.isArray(c)) {
    fail(`分类条目必须是对象（YAML mapping），当前类型为 ${Array.isArray(c) ? 'array' : typeof c}`);
    continue;
  }

  // 必填字段存在性
  if (!c.id) fail(`分类缺少 id 字段: ${JSON.stringify(c)}`);
  if (seenCatIds.has(c.id)) fail(`分类 id 重复: ${c.id}`);
  seenCatIds.add(c.id);
  if (!c.name) fail(`分类 ${c.id} 缺少 name`);
  if (!c.name_en) fail(`分类 ${c.id} 缺少 name_en`);
  if (!c.icon) fail(`分类 ${c.id} 缺少 icon`);
  if (!c.description) fail(`分类 ${c.id} 缺少 description`);
  // 字段类型校验（防止误写为数组/对象，渲染异常）
  for (const f of catStringFields) {
    if (c[f] !== undefined && typeof c[f] !== 'string') {
      fail(`分类 ${c.id}: ${f} 必须是字符串，当前类型为 ${typeof c[f]}`);
    }
  }
  // R37：空白字符串校验（free-text 必填字段，同 Project name/description 同型对齐）
  // `name: "   "` 通过必填校验（非空字符串 truthy）和 typeof 校验（是字符串），但语义为空
  // 渲染为不可见空白，分类标题/描述消失，用户无法识别分类
  // 防御性 typeof：R29 类型校验已 fail 数组误写，此处跳过避免冗余错误
  for (const f of catStringFields) {
    if (typeof c[f] === 'string' && c[f].trim() === '') {
      fail(`分类 ${c.id}: ${f} 为空白字符串（仅含空格/制表符/换行），请填写有效内容`);
    }
  }
  // 未知字段校验（R33：Category interface 是封闭契约，拒绝 typo 字段）
  // 如贡献者写 `desription:` 而非 `description:`，description 会缺失但 desription 静默忽略
  // 防御性 typeof：YAML 解析为非对象时 Object.keys 报错，需先排除
  if (c && typeof c === 'object') {
    for (const k of Object.keys(c)) {
      if (!knownCategoryFields.has(k)) {
        fail(`分类 ${c.id || JSON.stringify(c)}: 未知字段 "${k}"，请检查拼写（已知字段：${[...knownCategoryFields].join('/')})`);
      }
    }
  }
  // category id 用于 URL（/category/<id>），必须 URL-friendly
  if (c.id && !urlFriendlyRe.test(c.id)) {
    fail(`分类 id "${c.id}" 不是 URL-friendly 格式（仅小写字母/数字/连字符，无首尾/连续连字符）`);
  }
}

// --- 校验项目 ---
console.log('\n▸ 项目数据');
const seenSlugs = new Set();
// R34：repo 跨项目唯一性校验所需集合
// GitHub owner/repo 解析不区分大小写（BurntSushi/ripgrep 与 burntSushi/Ripgrep 指向同一仓库），
// 因此归一化为小写后再比较，避免大小写差异掩盖重复收录
const seenRepos = new Set();
const requiredFields = ['name', 'slug', 'repo', 'description', 'category', 'addedAt', 'status'];
const validStatus = new Set(['published', 'pending', 'rejected']);
// sources 字段枚举（CONTRIBUTING + 设计方案声明的契约）
const validSources = new Set(['auto-discovered', 'community-nominated', 'curator-curated']);
// Project interface 已知字段集合（R33：拒绝未知字段，防止 typo 静默通过）
// 12 个字段：7 必填 + 5 可选（url/license/tags/language/sources）
// 与 src/lib/data.ts 的 Project interface 一一对应，新增字段需同步更新此处
const knownProjectFields = new Set([
  ...requiredFields,        // 7 必填
  'url', 'license', 'tags', 'language', 'sources',  // 5 可选
]);

// 常见 OSI 认可的 SPDX 许可证标识符（canonical 形式）
// 用于检测大小写错误（如 mit → MIT）。完整列表见 https://spdx.org/licenses/
const spdxLicenses = new Set([
  'MIT', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', 'ISC', 'MPL-2.0',
  'GPL-3.0-only', 'GPL-3.0-or-later', 'GPL-2.0-only', 'GPL-2.0-or-later',
  'LGPL-3.0-only', 'LGPL-3.0-or-later', 'LGPL-2.1-only', 'LGPL-2.1-or-later',
  'AGPL-3.0-only', 'AGPL-3.0-or-later', 'Unlicense', '0BSD', 'CC0-1.0',
  'CC-BY-4.0', 'CC-BY-SA-4.0', 'WTFPL', 'Zlib', 'Boost Software License',
]);
// lowercase → canonical 映射，用于检测大小写错误
const spdxLowercaseMap = new Map();
for (const id of spdxLicenses) {
  spdxLowercaseMap.set(id.toLowerCase(), id);
}

for (const { file, data: p } of projects) {
  const fileBase = basename(file, '.yaml'); // 去掉 .yaml 扩展名
  const label = `${fileBase}.yaml`;

  // R36：空文件/非对象防御性检查
  // 空文件或仅含注释的 YAML 解析为 null，YAML 顶层为字符串/数字时解析为非对象。
  // R31 健壮性模式扩展：R31 处理"字段类型错误"，此处处理"整个项目对象为 null/非对象"。
  // 不防御会导致后续所有 p[f] 访问抛 TypeError: Cannot read properties of null
  if (p === null || p === undefined) {
    fail(`${label}: 项目文件为空或仅含注释（YAML 解析为 null），请填写项目数据或删除该文件`);
    continue;
  }
  if (typeof p !== 'object' || Array.isArray(p)) {
    fail(`${label}: 项目文件顶层必须是对象（YAML mapping），当前类型为 ${Array.isArray(p) ? 'array' : typeof p}`);
    continue;
  }

  // 必填字段
  for (const f of requiredFields) {
    if (p[f] === undefined || p[f] === null || p[f] === '') {
      fail(`${label}: 缺少必填字段 ${f}`);
    }
  }

  // 未知字段校验（R33：Project interface 是封闭契约，拒绝 typo 字段）
  // 贡献者 typo 示例：`lisense:`（应为 license）/ `tagz:`（应为 tags）/ `lang:`（应为 language）/ `source:`（应为 sources）
  // 必填字段 typo 会因"缺少必填字段"被捕获，但可选字段 typo 会静默通过 → ProjectCard 渲染缺 badge
  // 防御性 typeof：YAML 解析为非对象时 Object.keys 报错，需先排除
  if (p && typeof p === 'object') {
    for (const k of Object.keys(p)) {
      if (!knownProjectFields.has(k)) {
        fail(`${label}: 未知字段 "${k}"，请检查拼写（已知字段：${[...knownProjectFields].join('/')})`);
      }
    }
  }

  // Project interface 必填字段类型校验（R31）
  // 必填校验只检查存在性（undefined/null/''），未检查 typeof。
  // 数组/对象误写会通过存在性校验，导致：
  // - name/description: 渲染异常（<h1>{name}</h1> 渲染为 "a,b"）
  // - slug: urlFriendlyRe.test() 会 String() 转换，可能误判通过
  // - repo: p.repo.split('/') 报 TypeError，validator 崩溃（CRITICAL）
  // - category/status: 后续枚举/引用校验会 fail，但错误信息不准确（报"不存在"而非"类型错误"）
  // - addedAt: 正则 .test() 会 String() 转换，可能误判通过
  // 与 R29 Category 字段类型校验同型：必填字段也需校验 typeof
  const projectRequiredStringFields = ['name', 'slug', 'repo', 'description', 'category', 'addedAt', 'status'];
  for (const f of projectRequiredStringFields) {
    if (p[f] !== undefined && p[f] !== null && p[f] !== '' && typeof p[f] !== 'string') {
      fail(`${label}: ${f} 必须是字符串，当前类型为 ${typeof p[f]}`);
    }
  }

  // R37：空白字符串校验（free-text 必填字段）
  // `name: "   "` 通过必填校验（非空字符串 truthy）和 typeof 校验（是字符串），但语义为空
  // 渲染为不可见空白，项目标题/描述消失，用户无法识别项目
  // slug/repo/category/addedAt/status 有格式/枚举/引用校验间接拦截空格，name/description 无后续校验
  // 防御性 typeof：R31 类型校验已 fail 数组误写，此处跳过避免冗余错误
  const freeTextRequiredFields = ['name', 'description'];
  for (const f of freeTextRequiredFields) {
    if (typeof p[f] === 'string' && p[f].trim() === '') {
      fail(`${label}: ${f} 为空白字符串（仅含空格/制表符/换行），请填写有效内容`);
    }
  }

  // addedAt 日期格式 YYYY-MM-DD（CONTRIBUTING 声明的契约）
  // 防御性 typeof 检查：R31 类型校验已 fail 数组误写，此处跳过避免冗余错误
  if (typeof p.addedAt === 'string' && p.addedAt && !/^\d{4}-\d{2}-\d{2}$/.test(p.addedAt)) {
    fail(`${label}: addedAt "${p.addedAt}" 不是 YYYY-MM-DD 格式`);
  }

  // addedAt 日期有效性校验（R34：横向审计发现，正则只校验"形如日期"不校验"真实日期"）
  // 2026-02-30 / 2026-13-01 / 2026-00-01 等通过正则但不是真实日期，Contributor 误写后会进入数据集，
  // 直到运行时 new Date() 才暴露（如排序异常、相对时间计算 NaN）
  // 防御性 typeof：addedAt 数组误写已被 R31 类型校验 fail，此处跳过避免冗余错误
  if (typeof p.addedAt === 'string' && p.addedAt && /^\d{4}-\d{2}-\d{2}$/.test(p.addedAt) && !isValidCalendarDate(p.addedAt)) {
    fail(`${label}: addedAt "${p.addedAt}" 不是有效日期（如 2 月无 30/31 日、月份不在 1-12 范围内）`);
  }

  // B4 slug vs 文件名
  // 防御性 typeof：数组 !== 字符串会误触发"不一致"错误
  if (typeof p.slug === 'string' && p.slug && p.slug !== fileBase) {
    fail(`${label}: slug "${p.slug}" 与文件名 "${fileBase}" 不一致（B4 契约：文件名即 slug）`);
  }

  // slug URL-friendly 格式（用于 /project/<slug> 路由）
  // 防御性 typeof：正则 .test() 会 String() 转换数组，可能误判
  if (typeof p.slug === 'string' && p.slug && !urlFriendlyRe.test(p.slug)) {
    fail(`${label}: slug "${p.slug}" 不是 URL-friendly 格式（仅小写字母/数字/连字符，无首尾/连续连字符）`);
  }

  // slug 唯一
  if (typeof p.slug === 'string' && p.slug) {
    if (seenSlugs.has(p.slug)) fail(`${label}: slug "${p.slug}" 重复`);
    seenSlugs.add(p.slug);
  }

  // B3 category 引用
  // 防御性 typeof：Set.has(数组) 返回 false，会误触发"不存在"错误
  if (typeof p.category === 'string' && p.category && !categoryIds.has(p.category)) {
    fail(`${label}: category "${p.category}" 不存在于 categories.yaml（B3 引用断裂）`);
  }

  // status 枚举
  // 防御性 typeof：Set.has(数组) 返回 false，会误触发"不在枚举内"错误
  if (typeof p.status === 'string' && p.status && !validStatus.has(p.status)) {
    fail(`${label}: status "${p.status}" 不在枚举 {published, pending, rejected} 内`);
  }

  // repo 格式校验
  // 防御性 typeof（CRITICAL）：数组没有 .split() 方法，会导致 TypeError 崩溃
  if (typeof p.repo === 'string' && p.repo) {
    const parts = p.repo.split('/');
    if (parts.length !== 2 || p.repo.includes('://')) {
      fail(`${label}: repo "${p.repo}" 应为 owner/repo 格式`);
    } else if (!parts[0] || !parts[1]) {
      // R51：空段校验（R37/R40 同型补全，Horizontal gap 修复）
      // `repo: "withastro/"` / `repo: "/astro"` / `repo: "/"` 通过 split('/') 长度校验（2 段），
      // 但 owner 或 repo 段为空字符串，生成无效 GitHub URL（https://github.com/withastro/ → 404）
      // 同型对齐 R37（前后空格）/ R40（中间空格）：repo 格式校验链补全
      fail(`${label}: repo "${p.repo}" 的 owner 或 repo 段为空，应为 "owner/repo" 格式（如 withastro/astro）`);
    }
  }

  // R37：repo 前后空格校验
  // `repo: " withastro/astro "` 通过 split('/') 格式校验（2 段），但 GitHub URL 含空格会 404
  // 防御性 typeof：R31 类型校验已 fail 数组误写，此处跳过避免冗余错误
  if (typeof p.repo === 'string' && p.repo && p.repo !== p.repo.trim()) {
    fail(`${label}: repo "${p.repo}" 含前导/尾部空格，应为 "${p.repo.trim()}"`);
  }

  // R40：repo 中间空格校验（R37 前后空格校验的同型补全）
  // R37 只校验前后空格（p.repo !== p.repo.trim()），但 `repo: "with astro/astro"` 
  // 通过前后空格校验（无前后空格）和 split('/') 格式校验（2 段），静默通过。
  // 但 GitHub owner/repo 不允许任何空格，URL https://github.com/with astro/astro 含空格 404。
  // 条件 `p.repo === p.repo.trim()` 避免与 R37 冗余：前后空格由 R37 报（提供 trim 修正值），
  // 中间空格由 R40 报（无法自动修正，提示检查拼写）。
  if (typeof p.repo === 'string' && p.repo && p.repo === p.repo.trim() && /\s/.test(p.repo)) {
    fail(`${label}: repo "${p.repo}" 含中间空格（owner/repo 不允许空格），请检查拼写`);
  }

  // repo 跨项目唯一性校验（R34：横向审计发现，validator 校验单项目 repo 格式但未校验跨项目唯一性）
  // 同一 GitHub 仓库被两个项目文件收录时，站点会出现重复条目，混淆用户并造成 SEO 重复内容
  // 大小写归一化：GitHub 解析 owner/repo 不区分大小写（BurntSushi/ripgrep == burntSushi/Ripgrep）
  // 防御性 typeof：repo 数组误写已被 R31 类型校验 fail，此处跳过避免冗余错误
  if (typeof p.repo === 'string' && p.repo) {
    const repoKey = p.repo.toLowerCase();
    if (seenRepos.has(repoKey)) {
      fail(`${label}: repo "${p.repo}" 已被其他项目收录（重复收录违反唯一性契约）`);
    } else {
      seenRepos.add(repoKey);
    }
  }

  // url 不应与 repo URL 重复（CONTRIBUTING：无独立官网时省略 url）
  // 防御性 typeof（R32）：若 url 是字符串而 repo 是数组，模板字面量会将数组 stringify，
  // 字符串相等比较可能误命中，输出误导性 warn（"url 与 repo URL 重复"）。
  // R31 模式：后续校验假设字符串时，必须在前面加 typeof 防御
  if (typeof p.url === 'string' && typeof p.repo === 'string' && p.url && p.repo && p.url === `https://github.com/${p.repo}`) {
    warn(`${label}: url "${p.url}" 与 repo URL 重复，无独立官网时应省略 url 字段`);
  }

  // url 格式校验（Project interface 契约：url?: string，CONTRIBUTING 示例带 https://）
  // 贡献者误写 `url: my-project.dev`（无协议）会被浏览器当相对路径，用户点击 404
  // R36：空字符串校验——`url: ""` 与 url 不存在语义不同，贡献者显式写空字符串是误写
  // R48：协议白名单校验（CRITICAL，安全审计 connection gap）
  // `new URL("javascript:alert(1)")` 不抛错（合法 URL），通过原校验后渲染层生成
  // `<a href="javascript:alert(document.cookie)">官网 ↗</a>`，用户点击触发 XSS。
  // 攻击向量：贡献者提交 PR `url: javascript:...`，validator 通过 → CI build 通过 →
  // ProjectCard / 详情页渲染可点击的 javascript: 链接 → 用户点击执行任意 JS。
  // 防御：白名单只允许 http/https，与渲染层 <a href> 安全契约对齐。
  // 同型对齐：repo 字段无此风险（前缀固定为 https://github.com/），
  //          category.id / project.slug 经 urlFriendlyRe 校验（^[a-z0-9]+...$），无法注入协议。
  if (p.url === '') {
    fail(`${label}: url 为空字符串，要么不写该字段，要么写有效 URL（如 https://example.com）`);
  } else if (p.url !== undefined) {
    if (typeof p.url !== 'string') {
      fail(`${label}: url 必须是字符串，当前类型为 ${typeof p.url}`);
    } else {
      try {
        const parsed = new URL(p.url);
        // R48：协议白名单（防 javascript: / data: / vbscript: XSS 注入到 <a href>）
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          fail(`${label}: url "${p.url}" 协议 "${parsed.protocol}" 不在白名单 {http, https} 内（防 XSS 注入，如 javascript: 协议点击触发任意 JS）`);
        }
      } catch {
        fail(`${label}: url "${p.url}" 不是合法 URL（应带协议，如 https://example.com）`);
      }
    }
  }

  // license 字段类型校验（Project interface 契约：license?: string）
  // SPDX canonical 校验隐式假设字符串，若误写为数组会被 String() 转换误判
  // R36：空字符串校验——`license: ""` 与 license 不存在语义不同，贡献者显式写空字符串是误写
  if (p.license === '') {
    fail(`${label}: license 为空字符串，要么不写该字段，要么写有效 SPDX 标识符（如 MIT）`);
  } else if (p.license !== undefined) {
    if (typeof p.license !== 'string') {
      fail(`${label}: license 必须是字符串，当前类型为 ${typeof p.license}`);
    } else if (p.license.trim() === '') {
      fail(`${label}: license 为空白字符串（仅含空格/制表符/换行），要么不写该字段，要么写有效 SPDX 标识符（如 MIT）`);
    }
  }

  // language 字段类型校验（Project interface 契约：language?: string）
  // 若误写为数组，<span>{language}</span> 会渲染为 "Rust,Python"
  // R36：空字符串校验——`language: ""` 与 language 不存在语义不同，贡献者显式写空字符串是误写
  if (p.language === '') {
    fail(`${label}: language 为空字符串，要么不写该字段，要么写有效语言名（如 Rust）`);
  } else if (p.language !== undefined) {
    if (typeof p.language !== 'string') {
      fail(`${label}: language 必须是字符串，当前类型为 ${typeof p.language}`);
    } else if (p.language.trim() === '') {
      fail(`${label}: language 为空白字符串（仅含空格/制表符/换行），要么不写该字段，要么写有效语言名（如 Rust）`);
    }
  }

  // sources 字段校验（CONTRIBUTING + 设计方案声明的契约）
  // R35 扩展：元素级校验（类型 + 非空 + 唯一），与 tags 同型对齐
  // - 类型校验在枚举校验之前：避免 `sources: [123]` 报误导性"不在枚举内"错误（R31 模式：类型错误优先报告）
  // - 非空校验：空字符串无枚举意义，`sources: [""]` 不应静默通过
  // - 唯一性校验：`sources: [community-nominated, community-nominated]` 重复无意义，同 tags 同型
  // R36：空数组校验——`sources: []` 与 sources 不存在语义不同，贡献者显式写空数组是误写
  if (p.sources !== undefined) {
    if (!Array.isArray(p.sources)) {
      fail(`${label}: sources 必须是数组，当前类型为 ${typeof p.sources}`);
    } else if (p.sources.length === 0) {
      fail(`${label}: sources 为空数组，要么不写该字段，要么写有效来源（如 [community-nominated]）`);
    } else {
      const seenSources = new Set();
      for (const s of p.sources) {
        // 元素类型校验（R35：同 R27 tags 同型对齐，防误导性"不在枚举内"错误）
        if (typeof s !== 'string') {
          fail(`${label}: sources 元素 "${String(s)}" 必须是字符串，当前类型为 ${typeof s}`);
          continue; // 跳过后续校验，避免 Set.has(非字符串) 误报"不在枚举内"
        }
        // 元素非空校验（R35）
        if (s === '') {
          fail(`${label}: sources 元素为空字符串，无效`);
          continue;
        }
        // R39：元素空白字符串校验（同 R37 字段级 trim() 空白校验同型对齐）
        // `sources: ["   "]` 通过 R35 的 `s === ''` 校验，但被枚举校验报误导性"不在枚举内"
        // 真实问题是"空白字符串"而非"不在枚举内"（R31 模式：类型/空性错误优先于枚举校验）
        if (s.trim() === '') {
          fail(`${label}: sources 元素 "${s}" 为空白字符串（仅含空格/制表符/换行），请填写有效来源`);
          continue; // 跳过枚举校验，避免误导性"不在枚举内"
        }
        // 元素唯一性校验（R35）
        if (seenSources.has(s)) {
          fail(`${label}: sources 元素 "${s}" 重复`);
          continue;
        }
        seenSources.add(s);
        // 枚举值校验（CONTRIBUTING + 设计方案声明的契约）
        if (!validSources.has(s)) {
          fail(`${label}: sources 值 "${s}" 不在枚举 {auto-discovered, community-nominated, curator-curated} 内`);
        }
      }
    }
  }

  // tags 字段校验（Project interface 契约：tags?: string[]）
  // 贡献者可能误写 `tags: cli`（字符串）而非 `tags: [cli]`（数组），
  // 未校验会导致 ProjectCard / project 详情页构建时 project.tags.map() 报 TypeError
  // R35 扩展：元素级校验（非空 + 唯一），与 sources 同型对齐
  // - 非空校验：`tags: ["cli", ""]` 空字符串会渲染为 `#` 空标签，无意义
  // - 唯一性校验：`tags: ["cli", "cli"]` 重复元素会渲染重复 `#cli` 标签
  // R36：空数组校验——`tags: []` 与 tags 不存在语义不同，贡献者显式写空数组是误写
  if (p.tags !== undefined) {
    if (!Array.isArray(p.tags)) {
      fail(`${label}: tags 必须是数组，当前类型为 ${typeof p.tags}（应使用 YAML 数组语法，如 [cli, rust]）`);
    } else if (p.tags.length === 0) {
      fail(`${label}: tags 为空数组，要么不写该字段，要么写有效标签（如 [cli, rust]）`);
    } else {
      const seenTags = new Set();
      for (const t of p.tags) {
        // 元素类型校验（R27）
        if (typeof t !== 'string') {
          fail(`${label}: tags 元素 "${String(t)}" 必须是字符串，当前类型为 ${typeof t}`);
          continue; // 跳过后续校验，避免 Set.has(非字符串) 误报"重复"
        }
        // 元素非空校验（R35）
        if (t === '') {
          fail(`${label}: tags 元素为空字符串，无效`);
          continue;
        }
        // R39：元素空白字符串校验（同 R37 字段级 trim() 空白校验同型对齐）
        // `tags: ["   "]` 通过 R35 的 `t === ''` 校验（"   " !== ''），但渲染为 `#   ` 不可见标签
        // R37 给字段级（name/description/license/language）加了 trim() 空白校验，元素级遗漏
        if (t.trim() === '') {
          fail(`${label}: tags 元素 "${t}" 为空白字符串（仅含空格/制表符/换行），请填写有效标签`);
          continue; // 跳过唯一性校验，避免空白字符串被加入 Set
        }
        // 元素唯一性校验（R35）
        if (seenTags.has(t)) {
          fail(`${label}: tags 元素 "${t}" 重复`);
          continue;
        }
        seenTags.add(t);
      }
    }
  }

  // license SPDX canonical 形式校验（CONTRIBUTING 声明的契约）
  // 双策略：已知许可证大小写错误 → fail；未知许可证 → warn（避免阻塞罕见但合法的许可证）
  // 防御性 typeof（R32）：license 数组误写时，String(数组) 会被 SPDX map 命中，
  // 而 canonical(string) !== p.license(数组) 恒为 true，输出矛盾错误：
  // `license "MIT" 不是 canonical SPDX 形式，应为 "MIT"`（同一字符串两边都有 MIT）
  // R31 模式：后续校验假设字符串时，必须在前面加 typeof 防御，避免类型错误字段导致误导性错误
  if (typeof p.license === 'string' && p.license !== '') {
    const canonical = spdxLowercaseMap.get(p.license.toLowerCase());
    if (canonical && canonical !== p.license) {
      fail(`${label}: license "${p.license}" 不是 canonical SPDX 形式，应为 "${canonical}"`);
    } else if (!canonical) {
      warn(`${label}: license "${p.license}" 不在常见 SPDX 列表中，请到 https://spdx.org/licenses/ 核对 canonical 形式`);
    }
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
