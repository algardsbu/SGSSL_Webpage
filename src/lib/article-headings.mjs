/** @typedef {{depth: 2|3, text: string, id: string}} ArticleHeading */

export function slugifyHeading(text) {
  return text
    .replace(/[øØ]/g, 'o').replace(/[æÆ]/g, 'ae').replace(/[åÅ]/g, 'a')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'avsnitt';
}

/** @returns {ArticleHeading[]} */
export function extractHeadings(body) {
  const used = new Map();
  const headings = [];
  for (const match of String(body || '').matchAll(/^(#{2,3})\s+(.+?)\s*#*\s*$/gm)) {
    const text = match[2].replace(/[`*_~\[\]]/g, '').trim();
    if (!text) continue;
    const base = slugifyHeading(text);
    const count = (used.get(base) || 0) + 1;
    used.set(base, count);
    headings.push({ depth: /** @type {2|3} */ (match[1].length), text, id: count === 1 ? base : `${base}-${count}` });
  }
  return headings;
}
