import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
// 注：如需禁用 Astro 遥测，请设置环境变量 ASTRO_TELEMETRY_DISABLED=1
// （CI 中已在 workflow 里设置；本地可用 `astro telemetry disable` 全局禁用）
export default defineConfig({
  site: 'https://lamdeyton.github.io',
  base: '/Vegavellum',
  integrations: [sitemap()],
});
