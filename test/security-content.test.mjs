import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateArticle, validateArticles, validateImage, validateUploads } from '../src/lib/content-validation.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5l0AAAAASUVORK5CYII=', 'base64');

async function imageFixture(t) {
    const root = await mkdtemp(join(tmpdir(), 'sgssl-security-image-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const publicDir = join(root, 'public');
    await mkdir(join(publicDir, 'images'), { recursive: true });
    await writeFile(join(publicDir, 'images', 'safe.png'), png);
    return { root, publicDir };
}

test('article image references stay inside the raster upload directory', async (t) => {
    const { publicDir } = await imageFixture(t);
    await validateImage('/images/safe.png', { publicDir });
    for (const path of [
        '/images/../private.png', '/images/%2e%2e/private.png', '/images/%252e%252e/private.png',
        '/images/nested/../../private.png', '/images\\safe.png', '/images//safe.png',
        '/images/safe.png?download=true', '/images/safe.png#fragment',
        'images/safe.png', '//evil.example/safe.png', 'https://evil.example/safe.png',
        'data:image/png;base64,AAAA', '/images/missing.png', '/images/active.svg',
        '/images/safe.php', '/images/safe.png.php', '/images/safe.png\0.php',
        '/pictures/safe.png', '/.data/safe.png',
    ]) {
        await assert.rejects(async () => validateImage(path, { publicDir }), undefined, path);
    }
});

test('a raster extension cannot disguise an executable upload', async (t) => {
    const { publicDir } = await imageFixture(t);
    for (const [name, body] of [
        ['fake.png', '<script>alert(1)</script>'],
        ['fake.jpg', '<?php echo "private"; ?>'],
        ['fake.webp', '<svg onload="alert(1)"></svg>'],
    ]) {
        await writeFile(join(publicDir, 'images', name), body);
        await assert.rejects(async () => validateImage(`/images/${name}`, { publicDir }), undefined, name);
    }
});

test('image symlinks cannot expose files outside the public directory', async (t) => {
    const { root, publicDir } = await imageFixture(t);
    const outside = join(root, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'private.png'), png);
    await symlink(join(outside, 'private.png'), join(publicDir, 'images', 'linked.png'));
    await symlink(outside, join(publicDir, 'images', 'linked-directory'));
    await assert.rejects(async () => validateImage('/images/linked.png', { publicDir }));
    await assert.rejects(async () => validateImage('/images/linked-directory/private.png', { publicDir }));
});

test('unreferenced uploads are validated before Astro copies public assets', async (t) => {
    const { publicDir } = await imageFixture(t);
    await validateUploads({ publicDir });
    await writeFile(join(publicDir, 'images', 'unused.php'), '<?php echo "unsafe"; ?>');
    await assert.rejects(validateUploads({ publicDir }), /Unsupported image format/);
    await rm(join(publicDir, 'images', 'unused.php'));
    await writeFile(join(publicDir, 'images', 'unused.png'), '<svg onload="alert(1)">');
    await assert.rejects(validateUploads({ publicDir }), /contents do not match/);
});

const articleData = {
    id: '5c29e24c-8b23-4c7e-a6c7-af03f201197f', title: 'Trygg tittel',
    description: 'En kort beskrivelse', date: '2026-09-24', image: '/images/safe.png',
    imageAlt: 'Et gyldig bilde', published: false, facebook: false, instagram: false,
};

test('image validation also covers Markdown references and rejects HTML image bypasses', async (t) => {
    const { publicDir } = await imageFixture(t);
    const article = { slug: 'safe-article', data: articleData };
    await validateArticle({ ...article, body: '![Bilde][photo]\n\n[photo]: /images/safe.png' }, { publicDir });
    for (const body of [
        '![Bilde](/images/missing.png)',
        '![Bilde][photo]\n\n[photo]: https://evil.example/remote.png',
        '![Bilde](data:image/png;base64,AAAA)',
        '<img src="https://evil.example/missing.png">',
        '<picture><source srcset="https://evil.example/missing.png"></picture>',
    ]) {
        await assert.rejects(validateArticle({ ...article, body }, { publicDir }), undefined, body);
    }
});

test('article frontmatter cannot invoke JavaScript or YAML object constructors', async (t) => {
    const { root, publicDir } = await imageFixture(t);
    const contentDir = join(root, 'articles');
    await mkdir(contentDir);
    for (const contents of [
        '---js\nmodule.exports = { published: true };\n---\nBody',
        '---\ntitle: !!js/function >\n  function () { return "danger"; }\n---\nBody',
        '---\ntitle: first\ntitle: second\n---\nBody',
        '---\n__proto__: { published: true }\n---\nBody',
    ]) {
        await writeFile(join(contentDir, 'malicious.md'), contents);
        await assert.rejects(validateArticles({ contentDir, publicDir }), undefined, contents);
    }
});
