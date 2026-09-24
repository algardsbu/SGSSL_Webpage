import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const pageRedirects = {
  ...Object.fromEntries(['about', 'contact', 'events', 'member-application', 'results', 'trainings', 'news'].map(name => [`${name}.html`, `/${name}/`])),
};
export const adminRedirects = ['admin.html', 'login.html', 'admin/index.html', 'admin/login/index.html', 'admin/logout/index.html', 'login/index.html'];

const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function staticOutput({ site, cmsUrl }) {
  return {
    name: 'sgssl-static-output',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const root = fileURLToPath(dir);
        // Sitemap derives from generated routes, so unpublished articles cannot enter it.
        const routes = [];
        async function scan(folder, prefix = '') {
          for (const entry of await readdir(folder, { withFileTypes: true })) {
            const relative = `${prefix}${entry.name}`;
            if (entry.isDirectory()) await scan(join(folder, entry.name), `${relative}/`);
            else if (entry.name === 'index.html') routes.push(`/${prefix}`);
          }
        }
        await scan(root);
        if (site) {
          const urls = routes.sort().map(route => `<url><loc>${escape(new URL(route, site).href)}</loc></url>`).join('');
          await writeFile(join(root, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`);
        }
        await writeFile(join(root, 'robots.txt'), site ? `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n');

        const redirects = { ...pageRedirects, ...Object.fromEntries(adminRedirects.map(path => [path, cmsUrl])) };
        // The legacy /index.html address already serves the homepage.
        for (const [path, target] of Object.entries(redirects)) {
          const destination = join(root, path);
          await mkdir(dirname(destination), { recursive: true });
          await writeFile(destination, `<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${escape(target)}"><title>Siden har flyttet</title></head><body><p>Siden har flyttet. <a href="${escape(target)}">Fortsett til siden</a>.</p></body></html>\n`);
        }
      },
    },
  };
}
