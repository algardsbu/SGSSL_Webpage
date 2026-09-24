import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { collectFiles, planDeployment, validateManagedPath, validateRemoteRoot } from '../scripts/deploy-lib.mjs';

test('deployment roots reject shell-like, traversal, and host-wide destinations', () => {
    for (const path of ['', '/', '.', '..', '/home', '/home/user/../www',
        '/www/..', '/www/./site', '/www//site', '/www\\site',
        '/www\nother', '/www\0other', '/www/$(touch-pwned)', '/www/;delete']) {
        assert.throws(() => validateRemoteRoot(path), undefined, JSON.stringify(path));
    }
    for (const path of ['www', '/www', '/home/club/www']) {
        assert.doesNotThrow(() => validateRemoteRoot(path), path);
    }
});

test('managed manifest paths cannot address hosting files outside their scope', () => {
    for (const path of ['', '.', '..', '../other.html', '/index.html', 'news/../../other.html',
        'news//article.html', 'news/./article.html', 'news\\article.html',
        'news/%2e%2e/other.html', 'news/article.html\0', '.env', '.ssh/id_rsa',
        'node_modules/private.js', 'server/config.js', 'auth.sqlite', 'secret.pem']) {
        assert.throws(() => validateManagedPath(path), undefined, JSON.stringify(path));
    }
    for (const path of ['index.html', 'news/example/index.html', 'news/test/index.html', 'news/docs/index.html', 'images/club.webp', '_astro/style.css']) {
        assert.doesNotThrow(() => validateManagedPath(path), path);
    }
});

test('a tampered previous manifest is rejected before planning deletions', () => {
    for (const files of [['../unrelated.txt'], ['/unrelated.txt'], ['.env'], ['images/../../secret'], ['index.html', 'index.html']]) {
        assert.throws(() => planDeployment(['index.html'], { version: 1, files }), undefined, JSON.stringify(files));
    }
    assert.throws(() => planDeployment(['index.html'], { version: 99, files: [] }));
});

test('dist collection rejects files and directories that are symbolic links', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'sgssl-security-dist-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const distDir = join(root, 'dist');
    const outside = join(root, 'outside');
    await mkdir(distDir);
    await mkdir(outside);
    await writeFile(join(outside, 'secret.html'), 'private-file');
    await symlink(join(outside, 'secret.html'), join(distDir, 'linked.html'));
    await assert.rejects(async () => collectFiles(distDir));
    await rm(join(distDir, 'linked.html'));
    await symlink(outside, join(distDir, 'linked-directory'));
    await assert.rejects(async () => collectFiles(distDir));
});

test('dist collection rejects private source and executable server artifacts', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'sgssl-security-dist-files-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    for (const name of ['.env', 'auth.sqlite', 'secret.pem', 'package.json', 'leak.ts', 'upload.php']) {
        const directory = join(root, name.replaceAll('.', '_'));
        await mkdir(directory);
        await writeFile(join(directory, name), 'not-a-public-artifact');
        await assert.rejects(async () => collectFiles(directory), undefined, name);
    }
});
