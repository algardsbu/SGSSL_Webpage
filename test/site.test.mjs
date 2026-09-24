import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { parse, stringify } from 'yaml';
import { parse as parseHTML } from 'parse5';
import { validateArticle, validateArticles } from '../src/lib/content-validation.mjs';
import { pageRedirects, adminRedirects } from '../scripts/static-output.mjs';

const exec = promisify(execFile);
const root = resolve('.');
const publicDir = join(root, 'public');
const data = (overrides = {}) => ({
  id: randomUUID(), title: 'Testnyhet', description: 'Beskrivelse for test.',
  date: '2026-09-24', image: '/images/SGSSL_LOGO.webp', imageAlt: 'Klubbens logo',
  published: false, facebook: false, facebookCaption: '', instagram: false, instagramCaption: '',
  ...overrides,
});
const markdown = (metadata, body = 'Testinnhold med **uthevet tekst**.') => `---\n${stringify(metadata)}---\n\n${body}\n`;

test('article metadata rejects invalid dates, booleans and missing fields', async () => {
  const valid = data();
  const parsed = await validateArticle({ slug: 'stabil-url', data: valid, body: 'Innhold' }, { publicDir });
  assert.equal(parsed.id, valid.id);
  for (const overrides of [
    { id: 'invalid' }, { title: '' }, { description: ' ' }, { date: '2026-02-30' },
    { date: '2026-01-01T12:00:00Z' }, { published: 'false' }, { facebook: 'true' },
    { instagram: 1 }, { imageAlt: '' }, { image: '/images/missing.webp' }, { gallery: 'not-an-array' }, { gallery: ['/images/missing.webp'] }, { slug: 'override' },
  ]) {
    await assert.rejects(validateArticle({ slug: 'stabil-url', data: { ...valid, ...overrides }, body: 'Innhold' }, { publicDir }));
  }
  const defaults = { ...valid };
  delete defaults.published;
  delete defaults.facebook;
  delete defaults.instagram;
  const normalized = await validateArticle({ slug: 'stabil-url', data: defaults, body: 'Innhold' }, { publicDir });
  assert.equal(normalized.published, false);
  assert.equal(normalized.facebook, false);
  assert.equal(normalized.instagram, false);
});

test('collection rejects duplicate UUIDs and unsafe or executable filenames', async (t) => {
  const contentDir = await mkdtemp(join(tmpdir(), 'sgssl-collection-'));
  t.after(() => rm(contentDir, { recursive: true, force: true }));
  const metadata = data();
  await writeFile(join(contentDir, 'one.md'), markdown(metadata));
  await writeFile(join(contentDir, 'two.md'), markdown({ ...metadata, title: 'Another title' }));
  await assert.rejects(validateArticles({ contentDir, publicDir }), /Duplicate article UUID/);
  await rm(join(contentDir, 'two.md'));
  for (const name of ['article.mdx', 'Article.md', 'bad slug.md', 'article.js']) {
    await writeFile(join(contentDir, name), markdown(data()));
    await assert.rejects(validateArticles({ contentDir, publicDir }));
    await rm(join(contentDir, name));
  }
});

test('CMS schema defaults to drafts, keeps stable filenames and configures permitted uploads', async () => {
  const cms = parse(await readFile('.pages.yml', 'utf8'));
  const articles = cms.content.find(entry => entry.name === 'articles');
  assert.equal(articles.path, 'src/content/articles');
  assert.equal(articles.operations.rename, false);
  assert.match(articles.filename.template, /\{.*title.*\}/);
  assert.equal(articles.filename.field, false);
  const fields = Object.fromEntries(articles.fields.map(field => [field.name, field]));
  assert.equal(fields.id.type, 'uuid');
  assert.equal(fields.id.readonly, true);
  for (const name of ['published', 'facebook', 'instagram']) assert.equal(fields[name].default, false);
  assert.equal(fields.gallery.type, 'image');
  assert.equal(fields.gallery.options.multiple.max, 12);
  assert.equal(fields.gallery.options.unique, true);
  assert.ok(articles.view.fields.includes('published'));
  const media = Array.isArray(cms.media) ? cms.media[0] : cms.media;
  assert.equal(media.input, 'public/images');
  assert.equal(media.output, '/images');
  assert.deepEqual(new Set(media.extensions), new Set(['jpg', 'jpeg', 'png', 'webp']));
});

test('build preserves club pages, news, legacy redirects and CMS links', async () => {
  const homepage = await readFile('dist/index.html', 'utf8');
  assert.match(homepage, /Sammen om skiskyttergleden/);
  assert.match(homepage, /post@sgssl.no/);
  assert.match(homepage, /Admin Login/);
  const news = await readFile('dist/news/index.html', 'utf8');
  assert.match(news, /Nyheter/);
  for (const [from, to] of Object.entries(pageRedirects)) {
    const redirect = await readFile(join('dist', from), 'utf8');
    assert.ok(redirect.includes(`content="0;url=${to}"`), from);
    assert.ok(redirect.includes(`href="${to}"`), from);
  }
  for (const from of adminRedirects) {
    const redirect = await readFile(join('dist', from), 'utf8');
    assert.match(redirect, /https:\/\/app.pagescms.org/);
    assert.doesNotMatch(redirect, /<form/i);
  }
  for (const page of ['about', 'contact', 'member-application', 'results', 'trainings']) {
    assert.match(await readFile(join('dist', page, 'index.html'), 'utf8'), /Under utvikling/);
  }
});

test('published build renders Markdown, keeps slugs after title edits and removes unpublished articles', { timeout: 180_000 }, async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'sgssl-site-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  for (const name of ['src', 'public', 'scripts', 'astro.config.mjs', 'tsconfig.json', 'package.json']) {
    await cp(join(root, name), join(fixture, name), { recursive: true });
  }
  await symlink(join(root, 'node_modules'), join(fixture, 'node_modules'), 'dir');
  const contentDir = join(fixture, 'src/content/articles');
  await writeFile(join(fixture, 'src/data/events.json'), JSON.stringify([
    { id: randomUUID(), title: 'CALENDAR-PUBLIC-FIXTURE', date: '2099-09-24', time: '18:00', location: 'Teststed', published: true },
    { id: randomUUID(), title: 'CALENDAR-DRAFT-PRIVATE', date: '2099-09-24', description: 'PRIVATE-EVENT-DESCRIPTION', published: false },
  ]));
  await rm(contentDir, { recursive: true });
  await mkdir(contentDir);
  const articleData = [
    data({ title: 'Eldste nyhet', date: '2020-01-01', published: true }),
    data({ title: 'Mellomste nyhet', date: '2025-01-01', published: true }),
    data({ title: 'Nyeste nyhet <script>METADATA-PROBE</script>', description: 'Beskrivelse <script>METADATA-PROBE</script>', imageAlt: 'Logo " onerror="alert(1)', date: '2026-09-24', published: true }),
    data({ title: 'Fremtidig datert nyhet', date: '2099-01-01', published: true }),
    data({ title: 'HEMMELIG-UTKAST-TITTEL', date: '2099-12-31' }),
  ];
  for (let i = 0; i < articleData.length; i++) {
    await writeFile(join(contentDir, `article-${i}.md`), markdown(articleData[i], i === 4 ? 'HEMMELIG-UTKAST-INNHOLD' : 'Testinnhold med **uthevet tekst**.\n\n[Klubben](/about/)\n\n<script>alert("XSS-MARKER")</script>\n\n<a href="javascript:alert(1)">Usikker lenke</a>'));
  }
  const build = () => exec(process.execPath, [join(root, 'node_modules/astro/bin/astro.mjs'), 'build'], {
    cwd: fixture,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', SITE_URL: 'https://sgssl.no', PUBLIC_CMS_URL: 'https://app.pagescms.org/test/club' },
    maxBuffer: 4 * 1024 * 1024,
  });
  await build();
  const read = path => readFile(join(fixture, 'dist', path), 'utf8');
  const homepage = await read('index.html');
  const eventPage = await read('events/index.html');
  assert.match(homepage, /CALENDAR-PUBLIC-FIXTURE/);
  assert.match(eventPage, /CALENDAR-PUBLIC-FIXTURE/);
  assert.doesNotMatch(homepage + eventPage, /CALENDAR-DRAFT-PRIVATE|PRIVATE-EVENT-DESCRIPTION/);
  const news = await read('news/index.html');
  assert.ok(homepage.indexOf('Fremtidig datert nyhet') < homepage.indexOf('Nyeste nyhet'));
  assert.ok(homepage.indexOf('Nyeste nyhet') < homepage.indexOf('Mellomste nyhet'));
  assert.doesNotMatch(homepage, /Eldste nyhet/);
  assert.match(news, /Eldste nyhet/);
  assert.doesNotMatch(news + homepage, /HEMMELIG-UTKAST/);
  await assert.rejects(access(join(fixture, 'dist/news/article-4/index.html')));
  const article = await read('news/article-2/index.html');
  assert.match(article, /<strong>uthevet tekst<\/strong>/);
  assert.match(article, /href="\/about\/"/);
  assert.match(article, /24\. september 2026/);
  assert.match(article, /property="og:type" content="article"/);
  assert.match(article, /https:\/\/sgssl.no\/news\/article-2\//);
  assert.doesNotMatch(article, /XSS-MARKER|href="javascript:/);
  // Angle brackets within a quoted attribute are valid text; inspect the HTML
  // tree to distinguish that text from injected elements or event attributes.
  function inspectMetadata(node) {
    for (const attr of node.attrs ?? []) assert.doesNotMatch(attr.name, /^on/i);
    if (node.tagName === 'script') {
      assert.doesNotMatch((node.childNodes ?? []).map(child => child.value ?? '').join(''), /METADATA-PROBE/);
    }
    for (const child of node.childNodes ?? []) inspectMetadata(child);
  }
  inspectMetadata(parseHTML(article));
  assert.match(article, /&lt;script&gt;METADATA-PROBE/);
  let sitemap = await read('sitemap.xml');
  assert.match(sitemap, /https:\/\/sgssl.no\/news\/article-2\//);
  assert.doesNotMatch(sitemap, /article-4|admin|\.html/);
  assert.match(await read('admin.html'), /https:\/\/app.pagescms.org\/test\/club/);

  const originalId = articleData[2].id;
  articleData[2].title = 'Endret tittel, samme URL';
  await writeFile(join(contentDir, 'article-2.md'), markdown(articleData[2]));
  await build();
  assert.match(await read('news/article-2/index.html'), /Endret tittel, samme URL/);
  assert.equal((await validateArticles({ contentDir, publicDir: join(fixture, 'public') })).find(entry => entry.slug === 'article-2').data.id, originalId);

  articleData[2].published = false;
  await writeFile(join(contentDir, 'article-2.md'), markdown(articleData[2]));
  await build();
  await assert.rejects(access(join(fixture, 'dist/news/article-2/index.html')));
  sitemap = await read('sitemap.xml');
  assert.doesNotMatch(sitemap, /article-2|article-4/);
  assert.doesNotMatch(await read('index.html'), /Endret tittel, samme URL/);

  for (let i = 0; i < articleData.length; i++) {
    articleData[i].published = false;
    await writeFile(join(contentDir, `article-${i}.md`), markdown(articleData[i]));
  }
  await build();
  assert.match(await read('news/index.html'), /Ingen nyheter er publisert ennå/);
  assert.match(await read('index.html'), /Ingen nyheter er publisert ennå/);
  assert.doesNotMatch(await read('sitemap.xml'), /\/news\/article-/);
});
