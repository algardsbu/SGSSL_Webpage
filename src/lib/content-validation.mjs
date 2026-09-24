import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fields = new Set(['id', 'title', 'description', 'date', 'image', 'imageAlt', 'gallery', 'published', 'facebook', 'facebookCaption', 'instagram', 'instagramCaption']);

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validateSlug(slug) {
  if (typeof slug !== 'string' || slug.length > 240 || !SLUG.test(slug)) {
    throw new Error(`Invalid article slug: ${slug}. Use a lowercase, hyphen-separated filename.`);
  }
  return slug;
}

// Disallow links anywhere along a public path, including links back into public/.
async function regularPath(root, relative) {
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Image directory must be a real directory');
  let current = root;
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    if ((await lstat(current)).isSymbolicLink()) throw new Error(`Image symlinks are not allowed: ${relative}`);
  }
  if (!(await lstat(current)).isFile()) throw new Error(`Image is not a regular file: ${relative}`);
  const resolved = await realpath(current);
  const actualRoot = await realpath(root);
  if (!resolved.startsWith(`${actualRoot}${path.sep}`)) throw new Error(`Image escapes public directory: ${relative}`);
  return current;
}

export async function validateImage(value, { publicDir = path.resolve('public') } = {}) {
  if (typeof value !== 'string' || !value.startsWith('/images/') || /[\\%?#\x00-\x1f]/.test(value)) {
    throw new Error(`Invalid image path: ${value}; use an uploaded /images/ image`);
  }
  const relative = value.slice(1);
  if (relative.split('/').some((part) => !part || part === '.' || part === '..' || part.startsWith('.'))) throw new Error(`Unsafe image path: ${value}`);
  const extension = path.extname(value).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(extension)) throw new Error(`Unsupported image format: ${value}`);
  let file;
  try { file = await regularPath(publicDir, relative); }
  catch (error) { throw new Error(`Missing or unsafe image ${value}: ${error.message}`); }
  const bytes = await readFile(file);
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp = bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!(extension === '.png' ? isPng : extension === '.webp' ? isWebp : isJpeg)) throw new Error(`Image contents do not match extension: ${value}`);
}

export async function validateArticle({ slug, data, body }, options = {}) {
  validateSlug(slug);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`Invalid metadata in ${slug}`);
  for (const key of Object.keys(data)) if (!fields.has(key)) throw new Error(`Unknown article field ${key} in ${slug}`);
  if (typeof data.id !== 'string' || !UUID.test(data.id)) throw new Error(`Invalid UUID v4 in ${slug}`);
  for (const [key, max] of [['title', 160], ['description', 320], ['imageAlt', 500]]) {
    if (typeof data[key] !== 'string' || !data[key].trim() || data[key].length > max) throw new Error(`Invalid ${key} in ${slug}`);
  }
  if (!validDate(data.date)) throw new Error(`Invalid publication date in ${slug}; use YYYY-MM-DD`);
  const normalized = { ...data };
  for (const key of ['published', 'facebook', 'instagram']) {
    if (data[key] !== undefined && typeof data[key] !== 'boolean') throw new Error(`Invalid boolean ${key} in ${slug}`);
    normalized[key] = data[key] ?? false;
  }
  for (const key of ['facebookCaption', 'instagramCaption']) {
    if (data[key] !== undefined && (typeof data[key] !== 'string' || data[key].length > 5000)) throw new Error(`Invalid ${key} in ${slug}`);
    normalized[key] = data[key] ?? '';
  }
  if (typeof body !== 'string' || !body.trim()) throw new Error(`Missing article body in ${slug}`);
  await validateImage(data.image, options);
  if (data.gallery !== undefined && (!Array.isArray(data.gallery) || data.gallery.length > 12)) throw new Error(`Invalid gallery in ${slug}; choose at most 12 images`);
  const gallery = data.gallery ?? [];
  if (!Array.isArray(gallery) || gallery.some((image) => typeof image !== 'string') || new Set(gallery).size !== gallery.length) throw new Error(`Invalid gallery in ${slug}; use unique uploaded images`);
  for (const image of gallery) await validateImage(image, options);
  normalized.gallery = gallery;
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body);
  const definitions = new Map();
  const images = [];
  visit(tree, 'definition', (node) => { if (!definitions.has(node.identifier)) definitions.set(node.identifier, node.url); });
  visit(tree, (node) => {
    if (node.type === 'html' && /<\s*(?:img|picture|source)\b/i.test(node.value)) throw new Error(`Use Markdown image syntax instead of HTML images in ${slug}`);
    if (node.type === 'image') images.push(node.url);
    if (node.type === 'imageReference') {
      const url = definitions.get(node.identifier);
      if (!url) throw new Error(`Missing image reference in ${slug}: ${node.identifier}`);
      images.push(url);
    }
  });
  for (const image of new Set(images)) await validateImage(image, options);
  return normalized;
}

export async function validateArticles({ contentDir = path.resolve('src/content/articles'), publicDir = path.resolve('public') } = {}) {
  const entries = [];
  const ids = new Set();
  const slugs = new Set();
  for (const file of (await readdir(contentDir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!file.isFile() || !file.name.endsWith('.md')) throw new Error(`Only flat Markdown article files are allowed: ${file.name}`);
    const slug = validateSlug(file.name.slice(0, -3));
    if (slugs.has(slug)) throw new Error(`Duplicate article slug: ${slug}`);
    slugs.add(slug);
    const raw = await readFile(path.join(contentDir, file.name), 'utf8');
    // Parse YAML explicitly; never enable gray-matter's executable JS engines.
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
    if (!match) throw new Error(`Article requires YAML frontmatter: ${file.name}`);
    const document = parseDocument(match[1], { schema: 'core', uniqueKeys: true });
    if (document.errors.length || document.warnings.length) throw new Error(`Invalid YAML metadata in ${file.name}`);
    const body = raw.slice(match[0].length);
    const data = await validateArticle({ slug, data: document.toJS({ maxAliasCount: 100 }), body }, { publicDir });
    const id = data.id.toLowerCase();
    if (ids.has(id)) throw new Error(`Duplicate article UUID: ${id}`);
    ids.add(id);
    entries.push({ slug, data, body });
  }
  return entries;
}

export async function validateUploads({ publicDir = path.resolve('public') } = {}) {
  async function walk(directory, prefix) {
    if ((await lstat(directory)).isSymbolicLink()) throw new Error(`Upload directory symlink is not allowed: ${prefix}`);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const url = `${prefix}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`Upload symlink is not allowed: ${url}`);
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), url);
      else if (entry.isFile()) await validateImage(url, { publicDir });
      else throw new Error(`Upload is not a regular image: ${url}`);
    }
  }
  await walk(path.join(publicDir, 'images'), '/images');
}
