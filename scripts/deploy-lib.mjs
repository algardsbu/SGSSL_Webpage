import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const MANIFEST_NAME = '.sgssl-deploy-manifest.json';
const staticExtensions = new Set(['.html', '.css', '.js', '.json', '.xml', '.txt', '.jpg', '.jpeg', '.png', '.webp', '.svg', '.ico', '.woff', '.woff2']);
const forbiddenNames = new Set(['package.json', 'package-lock.json', 'tsconfig.json', 'credentials.json']);

export function validateRemoteRoot(value) {
  if (typeof value !== 'string' || !value || value.endsWith('/') || value.includes('//') || /[^A-Za-z0-9_./-]/.test(value)) throw new Error('Unsafe SFTP target path');
  const parts = value.replace(/^\//, '').split('/');
  if (parts.some((part) => !part || part.startsWith('.')) || !parts.includes('www')) throw new Error('SFTP target must be www or a directory beneath www');
  return value;
}

export function validateManagedPath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || /[\\%?#\x00-\x1f\x7f]/.test(value)) throw new Error(`Unsafe managed path: ${value}`);
  const parts = value.split('/');
  if (parts.some((part) => !part || part.startsWith('.') || !/^[\p{L}\p{N}_ .-]+$/u.test(part))) throw new Error(`Unsafe managed path: ${value}`);
  if (['src', 'server', 'node_modules', 'test', 'tests', 'scripts', 'docs'].includes(parts[0].toLowerCase())) throw new Error(`Private source path: ${value}`);
  if (forbiddenNames.has(parts.at(-1).toLowerCase()) || !staticExtensions.has(path.posix.extname(value).toLowerCase())) throw new Error(`Disallowed deployment file: ${value}`);
  return value;
}

function normalizeFiles(files) {
  if (!Array.isArray(files) || files.length > 20000) throw new Error('Invalid deployment file list');
  const seen = new Set();
  for (const file of files) {
    validateManagedPath(file);
    if (seen.has(file)) throw new Error(`Duplicate deployment path: ${file}`);
    seen.add(file);
  }
  return [...seen].sort();
}

export async function collectFiles(distDir) {
  const root = path.resolve(distDir);
  const rootStat = await lstat(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('Build output must be a real directory');
  const files = [];
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`Deployment symlinks are not allowed: ${relative}`);
      if (entry.isDirectory()) {
        // Validate each directory using a synthetic static leaf before descending.
        validateManagedPath(`${relative}/index.html`);
        await walk(path.join(directory, entry.name), `${relative}/`);
      } else if (entry.isFile()) {
        files.push(validateManagedPath(relative));
      } else throw new Error(`Deployment file is not regular: ${relative}`);
    }
  }
  await walk(root);
  return normalizeFiles(files);
}

export function planDeployment(currentFiles, previousManifest = { version: 1, files: [] }) {
  if (!previousManifest || previousManifest.version !== 1 || Object.keys(previousManifest).some((key) => !['version', 'files'].includes(key))) throw new Error('Invalid deployment manifest');
  const upload = normalizeFiles(currentFiles);
  const previous = normalizeFiles(previousManifest.files);
  const next = new Set(upload);
  return { upload, remove: previous.filter((file) => !next.has(file)), manifest: { version: 1, files: upload } };
}

async function inspectPath(client, target, { createParents = false, leaf = 'file', allowMissing = true } = {}) {
  const parts = target.replace(/^\//, '').split('/');
  let current = target.startsWith('/') ? '' : null;
  for (let i = 0; i < parts.length; i++) {
    current = current === null ? parts[i] : `${current}/${parts[i]}`;
    let type = await client.exists(current);
    const isLeaf = i === parts.length - 1;
    if (!type && createParents && !isLeaf) {
      await client.mkdir(current, false);
      type = await client.exists(current);
    }
    if (!type) {
      if (!allowMissing) throw new Error(`SFTP path does not exist: ${current}`);
      return false;
    }
    if (type === 'l' || (isLeaf ? type !== (leaf === 'directory' ? 'd' : '-') : type !== 'd')) throw new Error(`Unsafe remote path or symlink: ${current}`);
  }
  return true;
}

async function readManifest(client, remoteRoot) {
  const filename = `${remoteRoot}/${MANIFEST_NAME}`;
  if (!await inspectPath(client, filename)) return { version: 1, files: [] };
  const bytes = await client.get(filename);
  if (!Buffer.isBuffer(bytes) || bytes.length > 2_000_000) throw new Error('Invalid or oversized deployment manifest');
  let manifest;
  try { manifest = JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('Invalid deployment manifest JSON'); }
  planDeployment([], manifest);
  return manifest;
}

/**
 * Client is the ssh2-sftp-client interface: exists, get, put, mkdir,
 * posixRename, delete, rmdir. Tests can supply an isolated in-memory server.
 * All uploads are staged before any live replacement or managed deletion.
 */
export async function deploySite(client, { distDir, remoteRoot }) {
  validateRemoteRoot(remoteRoot);
  const files = await collectFiles(distDir);
  if (!files.includes('index.html')) throw new Error('Refusing to deploy an incomplete build without index.html');
  await inspectPath(client, remoteRoot, { leaf: 'directory', allowMissing: false });
  const previous = await readManifest(client, remoteRoot);
  const plan = planDeployment(files, previous);
  const owned = new Set(previous.files);
  // Refuse to overwrite host files unless our manifest owns them already.
  for (const file of [...new Set([...files, ...previous.files])]) {
    if (await inspectPath(client, `${remoteRoot}/${file}`) && files.includes(file) && !owned.has(file)) throw new Error(`Unmanaged remote file would be overwritten: ${file}`);
  }

  const stage = `${remoteRoot}/.sgssl-stage-${randomUUID()}`;
  await client.mkdir(stage, false);
  const staged = [];
  const directories = new Set();
  const stageFile = (file) => `${stage}/${file}`;
  async function upload(file, source) {
    const target = stageFile(file);
    await inspectPath(client, target, { createParents: true });
    const parent = path.posix.dirname(file);
    if (parent !== '.') {
      let prefix = '';
      for (const part of parent.split('/')) { prefix = prefix ? `${prefix}/${part}` : part; directories.add(`${stage}/${prefix}`); }
    }
    // Record before transfer so partially uploaded files are cleaned up too.
    staged.push(target);
    const expected = Buffer.isBuffer(source) ? source : await readFile(source);
    await client.put(expected, target);
    // Do not trust stream completion alone: some SFTP client/runtime versions
    // resolve put() even after a failed WRITE. Verify every byte before promotion.
    const actual = await client.get(target);
    if (!Buffer.isBuffer(actual) || !actual.equals(expected)) throw new Error(`SFTP upload verification failed: ${file}`);
  }
  try {
    for (const file of files) await upload(file, path.join(distDir, ...file.split('/')));
    // Keep all old and new paths owned if a later promotion or deletion fails.
    // This journal is only promoted after every file has uploaded successfully.
    const journal = { version: 1, files: [...new Set([...previous.files, ...files])].sort() };
    await upload(MANIFEST_NAME, Buffer.from(JSON.stringify(journal)));
    await client.posixRename(stageFile(MANIFEST_NAME), `${remoteRoot}/${MANIFEST_NAME}`);
    for (const file of files) {
      const target = `${remoteRoot}/${file}`;
      await inspectPath(client, target, { createParents: true });
      await client.posixRename(stageFile(file), target);
    }
    // Deletions start only after every replacement has reached its final path.
    for (const file of plan.remove) {
      const target = `${remoteRoot}/${file}`;
      if (await inspectPath(client, target)) await client.delete(target);
    }
    await upload(MANIFEST_NAME, Buffer.from(JSON.stringify(plan.manifest)));
    await client.posixRename(stageFile(MANIFEST_NAME), `${remoteRoot}/${MANIFEST_NAME}`);
    return plan;
  } finally {
    // Never recursively remove remote paths: only this run's known staged files.
    for (const file of [...new Set(staged)].reverse()) {
      try { if (await inspectPath(client, file)) await client.delete(file); } catch { /* Preserve primary failure; staged files can be removed manually. */ }
    }
    for (const directory of [...directories].sort((a, b) => b.length - a.length)) {
      try { await client.rmdir(directory, false); } catch { /* Non-empty or unavailable: retain for inspection. */ }
    }
    try { await client.rmdir(stage, false); } catch { /* See above. */ }
  }
}
