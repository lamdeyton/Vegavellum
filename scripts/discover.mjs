#!/usr/bin/env node
/**
 * C 层自动发现机器人
 *
 * 从 GitHub 按指标阈值发现优质开源项目，生成候选 YAML 到 data/candidates/
 * 维护者审核后移动到 data/projects/ 并标记为 published
 *
 * 使用方式：
 *   npm run discover
 *   GITHUB_TOKEN=xxx npm run discover   # 带 token 提高 API 限额
 *
 * 筛选指标（可通过环境变量调整）：
 *   MIN_STARS       最低 stars 数，默认 1000
 *   MIN_PUSHED_DAYS 最近 push 天数，默认 180（半年内有提交）
 *   PER_TOPIC       每个 topic 抓取数量，默认 10
 *   TOPICS          要搜索的 topic 列表（逗号分隔），见下方默认列表
 */

import { writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
const projectsDir = join(dataDir, 'projects');
const candidatesDir = join(dataDir, 'candidates');

const MIN_STARS = parseInt(process.env.MIN_STARS || '1000', 10);
const MIN_PUSHED_DAYS = parseInt(process.env.MIN_PUSHED_DAYS || '180', 10);
const PER_TOPIC = parseInt(process.env.PER_TOPIC || '10', 10);

const DEFAULT_TOPICS = [
  'frontend-framework',
  'backend-framework',
  'developer-tools',
  'machine-learning',
  'database',
  'devops',
  'security',
  'cli',
  'javascript-library',
];

const TOPICS = process.env.TOPICS ? process.env.TOPICS.split(',') : DEFAULT_TOPICS;

const CATEGORY_MAP = {
  'frontend-framework': 'frontend-framework',
  'react': 'frontend-framework',
  'vue': 'frontend-framework',
  'backend-framework': 'backend-framework',
  'developer-tools': 'dev-tools',
  'devtools': 'dev-tools',
  'machine-learning': 'ai-ml',
  'ai': 'ai-ml',
  'deep-learning': 'ai-ml',
  'llm': 'ai-ml',
  'database': 'database',
  'devops': 'devops',
  'kubernetes': 'devops',
  'docker': 'devops',
  'security': 'security',
  'cli': 'cli',
  'command-line': 'cli',
  'javascript-library': 'libraries',
  'python-library': 'libraries',
  'library': 'libraries',
};

function getCategoryFromTopics(topics) {
  for (const t of topics) {
    if (CATEGORY_MAP[t]) return CATEGORY_MAP[t];
  }
  return null;
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function getExistingRepos() {
  const repos = new Set();
  if (!existsSync(projectsDir)) return repos;
  const files = readdirSync(projectsDir).filter((f) => f.endsWith('.yaml'));
  for (const f of files) {
    const content = readFileSync(join(projectsDir, f), 'utf8');
    const match = content.match(/^repo:\s*(.+)$/m);
    if (match) repos.add(match[1].trim().toLowerCase());
  }
  if (existsSync(candidatesDir)) {
    const candFiles = readdirSync(candidatesDir).filter((f) => f.endsWith('.yaml'));
    for (const f of candFiles) {
      const content = readFileSync(join(candidatesDir, f), 'utf8');
      const match = content.match(/^repo:\s*(.+)$/m);
      if (match) repos.add(match[1].trim().toLowerCase());
    }
  }
  return repos;
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

async function searchGitHub(topic) {
  const pushedDate = new Date();
  pushedDate.setDate(pushedDate.getDate() - MIN_PUSHED_DAYS);
  const pushedStr = formatDate(pushedDate);

  const q = `topic:${topic} stars:>${MIN_STARS} pushed:>${pushedStr} license:mit,apache-2.0,bsd-3-clause`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${PER_TOPIC}`;

  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    console.error(`  ✗ 搜索 ${topic} 失败: ${res.status} ${text.slice(0, 200)}`);
    return [];
  }
  const data = await res.json();
  return data.items || [];
}

function generateYAML(repo, category) {
  const slug = slugify(repo.name);
  const today = formatDate(new Date());

  const lines = [
    `name: ${repo.name}`,
    `slug: ${slug}`,
    `repo: ${repo.full_name}`,
    `description: ${repo.description || ''}`,
    `category: ${category || 'libraries'}`,
  ];

  if (repo.homepage && repo.homepage.trim()) {
    lines.push(`url: ${repo.homepage.trim()}`);
  }

  if (repo.license?.spdx_id) {
    lines.push(`license: ${repo.license.spdx_id}`);
  }

  if (repo.topics && repo.topics.length > 0) {
    const tags = repo.topics.slice(0, 5).map((t) => t.toLowerCase()).filter((t) => t !== category);
    if (tags.length > 0) {
      lines.push(`tags: [${tags.join(', ')}]`);
    }
  }

  if (repo.language) {
    lines.push(`language: ${repo.language}`);
  }

  lines.push(`addedAt: ${today}`);
  lines.push(`status: pending`);
  lines.push(`sources: [auto-discovered]`);
  lines.push('stars: ' + repo.stargazers_count);
  lines.push('');

  return { slug, content: lines.join('\n') };
}

async function main() {
  console.log('🔍 Vegavellum C 层自动发现机器人');
  console.log(`   指标: stars ≥ ${MIN_STARS}, 近 ${MIN_PUSHED_DAYS} 天有提交`);
  console.log(`   Topics: ${TOPICS.join(', ')}`);
  console.log('');

  const existing = getExistingRepos();
  console.log(`📋 已收录/候选: ${existing.size} 个仓库`);
  console.log('');

  if (!existsSync(candidatesDir)) {
    mkdirSync(candidatesDir, { recursive: true });
  }

  let newCount = 0;
  const seenRepos = new Set(existing);

  for (const topic of TOPICS) {
    console.log(`🔍 搜索 topic: ${topic}...`);
    try {
      const items = await searchGitHub(topic);
      console.log(`   找到 ${items.length} 个结果`);

      for (const repo of items) {
        const fullNameLower = repo.full_name.toLowerCase();
        if (seenRepos.has(fullNameLower)) continue;
        seenRepos.add(fullNameLower);

        const category = getCategoryFromTopics(repo.topics || [topic]);
        const { slug, content } = generateYAML(repo, category);

        const filePath = join(candidatesDir, `${slug}.yaml`);
        if (existsSync(filePath)) continue;

        writeFileSync(filePath, content, 'utf8');
        newCount++;
        console.log(`   ✨ 新增候选: ${repo.full_name} (⭐${repo.stargazers_count})`);
      }
    } catch (e) {
      console.error(`   ✗ 错误: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log('');
  console.log(`✅ 完成！新增 ${newCount} 个候选项目，保存在 data/candidates/`);
  console.log('');
  console.log('下一步：');
  console.log('  1. 查看 data/candidates/ 下的候选项目');
  console.log('  2. 审核通过后移动到 data/projects/，修改 status: published');
  console.log('  3. 运行 npm run validate 校验数据格式');
}

main().catch((e) => {
  console.error('❌ 运行失败:', e);
  process.exit(1);
});
