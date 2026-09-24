import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import { markdownConfig } from './scripts/markdown.mjs';
import { getCmsUrl, getSiteUrl } from './scripts/site-config.mjs';
import { staticOutput } from './scripts/static-output.mjs';

const env = { ...loadEnv(process.env.NODE_ENV || 'production', process.cwd(), ''), ...process.env };
const site = getSiteUrl(env.SITE_URL);
const cmsUrl = getCmsUrl(env.PUBLIC_CMS_URL);

export default defineConfig({
  output: 'static',
  site,
  trailingSlash: 'always',
  markdown: markdownConfig,
  integrations: [staticOutput({ site, cmsUrl })],
});
