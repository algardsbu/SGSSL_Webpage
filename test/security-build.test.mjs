import assert from 'node:assert/strict';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { validateArticles } from '../src/lib/content-validation.mjs';

const distDir = new URL('../dist/', import.meta.url);

async function filesUnder(root) {
    const files = [];
    for (const entry of await readdir(root, { withFileTypes: true })) {
        const target = join(root, entry.name);
        assert.equal((await lstat(target)).isSymbolicLink(), false, `Generated symlink: ${target}`);
        if (entry.isDirectory()) files.push(...await filesUnder(target));
        else files.push(target);
    }
    return files;
}

test('the deployment artifact contains only static public files', async () => {
    const { fileURLToPath } = await import('node:url');
    const root = fileURLToPath(distDir);
    const files = await filesUnder(root);
    assert.ok(files.some((file) => relative(root, file) === 'index.html'), 'Run npm test so the site is built first.');
    for (const file of files) {
        const name = relative(root, file).replaceAll('\\', '/');
        assert.doesNotMatch(name, /^(?:\.env(?:\.|$)|\.data|\.git|\.github|\.astro|src|server|test|node_modules)(?:\/|$)/i, name);
        assert.doesNotMatch(name, /(?:^|\/)(?:package(?:-lock)?\.json|README\.md|\.pages\.yml|astro\.config\.[^/]+)$/i, name);
        assert.doesNotMatch(name, /\.(?:sqlite(?:3)?(?:-(?:shm|wal))?|db|pem|key|md|mdx|ts|tsx|astro|map|php|phtml|cgi|sh)$/i, name);
        assert.match(name, /\.(?:html|css|js|json|xml|txt|png|jpe?g|webp|ico|woff2?)$/i, name);
        if (/\.(?:html|css|js|json|xml|txt)$/i.test(name)) {
            const contents = await readFile(file, 'utf8');
            assert.doesNotMatch(contents, /-----BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----/);
            assert.doesNotMatch(contents, /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/);
        }
    }
});

test('article pages and news listings follow the publication flag', async () => {
    const { fileURLToPath } = await import('node:url');
    const root = fileURLToPath(distDir);
    const files = await filesUnder(root);
    const pagePaths = new Set(files.map((file) => relative(root, file).replaceAll('\\', '/')));
    const news = await readFile(join(root, 'news/index.html'), 'utf8');
    const textual = (await Promise.all(files.filter((file) => /\.(?:html|xml|json|js)$/i.test(file)).map((file) => readFile(file, 'utf8')))).join('\n');
    for (const article of await validateArticles()) {
        if (article.data.published) {
            assert.equal(pagePaths.has(`news/${article.slug}/index.html`), true, article.slug);
            assert.equal(news.includes(`href="/news/${article.slug}/"`), true, article.slug);
            continue;
        }
        assert.equal(pagePaths.has(`news/${article.slug}/index.html`), false, article.slug);
        assert.equal(textual.includes(`/news/${article.slug}/`), false, article.slug);
        assert.equal(textual.includes(article.data.id), false, article.data.id);
        assert.equal(textual.includes(article.body.trim()), false, `Draft body: ${article.slug}`);
    }
});
