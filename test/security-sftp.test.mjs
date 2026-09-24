import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import SftpClient from 'ssh2-sftp-client';
import { deploymentConfig } from '../scripts/deploy.mjs';
import { deploySite, MANIFEST_NAME } from '../scripts/deploy-lib.mjs';
import { sftpFixture } from './fixtures/security-sftp.mjs';

const manifest = (files) => JSON.stringify({ version: 1, files });
const quietCallbacks = { error: (error) => { throw error; }, end: () => {}, close: () => {} };

function environment(fixture) {
    return {
        DEPLOY_ENABLED: 'true', SITE_URL: 'https://sgssl.no',
        SFTP_HOST: fixture.connection.host, SFTP_PORT: String(fixture.connection.port),
        SFTP_USERNAME: fixture.connection.username, SFTP_PASSWORD: fixture.connection.password,
        SFTP_REMOTE_DIR: '/www', SFTP_HOST_KEY_SHA256: fixture.fingerprint,
    };
}

async function clientFor(t, fixture, env = environment(fixture)) {
    const config = deploymentConfig(env);
    const client = new SftpClient('isolated-security-fixture', quietCallbacks);
    t.after(() => client.end());
    await client.connect({ ...config.connection, readyTimeout: 2000 });
    return client;
}

async function localBuild(t, files) {
    const root = await mkdtemp(join(tmpdir(), 'sgssl-security-sftp-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    for (const [name, body] of Object.entries(files)) {
        await mkdir(dirname(join(root, name)), { recursive: true });
        await writeFile(join(root, name), body);
    }
    return root;
}

test('SFTP uploads replacements before removing unpublished managed pages', async (t) => {
    const fixture = await sftpFixture(t, {
        '/www/index.html': 'old home', '/www/news/old/index.html': 'unpublished article',
        '/www/unrelated.html': 'hosting file owned by someone else',
        [`/www/${MANIFEST_NAME}`]: manifest(['index.html', 'news/old/index.html']),
    });
    const client = await clientFor(t, fixture);
    const distDir = await localBuild(t, { 'index.html': 'new home', 'news/current/index.html': 'current article' });
    const plan = await deploySite(client, { distDir, remoteRoot: '/www' });
    assert.deepEqual(plan.remove, ['news/old/index.html']);
    assert.equal(fixture.files.get('/www/index.html').toString(), 'new home');
    assert.equal(fixture.files.get('/www/news/current/index.html').toString(), 'current article');
    assert.equal(fixture.files.has('/www/news/old/index.html'), false);
    assert.equal(fixture.files.get('/www/unrelated.html').toString(), 'hosting file owned by someone else');
    assert.deepEqual(JSON.parse(fixture.files.get(`/www/${MANIFEST_NAME}`)), plan.manifest);
    const removed = fixture.operations.findIndex((op) => op.type === 'delete' && op.path === '/www/news/old/index.html');
    for (const destination of ['/www/index.html', '/www/news/current/index.html']) {
        const promoted = fixture.operations.findIndex((op) => op.type === 'rename' && op.destination === destination);
        assert.ok(promoted >= 0 && promoted < removed, destination);
    }
    assert.equal([...fixture.files.keys()].some((name) => name.includes('/.sgssl-stage-')), false);
});

test('a failed SFTP transfer preserves all live pages and the previous manifest', async (t) => {
    const originalManifest = manifest(['index.html', 'news/old/index.html']);
    const fixture = await sftpFixture(t, {
        '/www/index.html': 'old home', '/www/news/old/index.html': 'old article',
        [`/www/${MANIFEST_NAME}`]: originalManifest,
    });
    fixture.faults.write = (name) => name.endsWith('/index.html');
    const client = await clientFor(t, fixture);
    const distDir = await localBuild(t, { 'index.html': 'replacement' });
    await assert.rejects(deploySite(client, { distDir, remoteRoot: '/www' }));
    assert.equal(fixture.files.get('/www/index.html').toString(), 'old home');
    assert.equal(fixture.files.get('/www/news/old/index.html').toString(), 'old article');
    assert.equal(fixture.files.get(`/www/${MANIFEST_NAME}`).toString(), originalManifest);
    assert.equal(fixture.operations.some((op) => op.type === 'delete' && !op.path.includes('/.sgssl-stage-')), false);
});

test('SFTP refuses an unmanaged file collision without overwriting the host file', async (t) => {
    const fixture = await sftpFixture(t, { '/www/index.html': 'unrelated existing website' });
    const client = await clientFor(t, fixture);
    const distDir = await localBuild(t, { 'index.html': 'replacement' });
    await assert.rejects(deploySite(client, { distDir, remoteRoot: '/www' }), /Unmanaged/);
    assert.equal(fixture.files.get('/www/index.html').toString(), 'unrelated existing website');
    assert.equal(fixture.operations.length, 0);
});

test('SFTP rejects symlinked remote ancestors before reading or mutating their target', async (t) => {
    const fixture = await sftpFixture(t, {
        '/www/index.html': 'old home', '/outside/old/index.html': 'unrelated outside file',
        [`/www/${MANIFEST_NAME}`]: manifest(['index.html', 'news/old/index.html']),
    });
    fixture.symlinks.set('/www/news', '/outside');
    const client = await clientFor(t, fixture);
    const distDir = await localBuild(t, { 'index.html': 'new home' });
    await assert.rejects(deploySite(client, { distDir, remoteRoot: '/www' }), /symlink|Unsafe/);
    assert.equal(fixture.files.get('/outside/old/index.html').toString(), 'unrelated outside file');
    assert.equal(fixture.operations.length, 0);
});

test('SFTP rejects a traversal manifest before any remote write or deletion', async (t) => {
    const fixture = await sftpFixture(t, {
        '/www/index.html': 'old home', '/private.txt': 'outside content',
        [`/www/${MANIFEST_NAME}`]: manifest(['index.html', '../private.txt']),
    });
    const client = await clientFor(t, fixture);
    const distDir = await localBuild(t, { 'index.html': 'new home' });
    await assert.rejects(deploySite(client, { distDir, remoteRoot: '/www' }), /Unsafe/);
    assert.equal(fixture.files.get('/private.txt').toString(), 'outside content');
    assert.equal(fixture.operations.length, 0);
});

test('the production SSH host verifier rejects a different server key', async (t) => {
    const fixture = await sftpFixture(t);
    const env = environment(fixture);
    env.SFTP_HOST_KEY_SHA256 = `SHA256:${Buffer.alloc(32).toString('base64').replace(/=+$/, '')}`;
    const client = new SftpClient('wrong-key-security-fixture', quietCallbacks);
    t.after(() => client.end());
    const { connection } = deploymentConfig(env);
    await assert.rejects(client.connect({ ...connection, readyTimeout: 2000 }), /host|verification|Handshake/i);
    assert.equal(fixture.operations.length, 0);
});

test('deployment stays disabled until explicitly enabled with complete configuration', () => {
    for (const value of [undefined, '', 'false', '1', 'TRUE']) {
        assert.equal(deploymentConfig({ DEPLOY_ENABLED: value }), null);
    }
    assert.throws(() => deploymentConfig({ DEPLOY_ENABLED: 'true' }), /requires SITE_URL/);
});
