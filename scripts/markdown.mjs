import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { unified } from '@astrojs/markdown-remark';
import { visit } from 'unist-util-visit';
import { slugifyHeading } from '../src/lib/article-headings.mjs';

function rehypeHeadingIds() {
  return (tree) => {
    const used = new Map();
    visit(tree, 'element', (node) => {
      if (!/^h[23]$/.test(node.tagName)) return;
      const text = [];
      visit(node, 'text', (child) => text.push(child.value));
      const base = slugifyHeading(text.join(' '));
      const count = (used.get(base) || 0) + 1;
      used.set(base, count);
      node.properties = { ...node.properties, id: count === 1 ? base : `${base}-${count}` };
    });
  };
}

// Parse embedded HTML before sanitizing it. No MDX or executable content.
// Syntax highlighting is off so no later plugin introduces untrusted markup.
export const markdownOptions = {
  syntaxHighlight: false,
  rehypePlugins: [rehypeRaw, rehypeSanitize, rehypeHeadingIds],
};

export const markdownConfig = {
  syntaxHighlight: markdownOptions.syntaxHighlight,
  processor: unified({ rehypePlugins: markdownOptions.rehypePlugins }),
};
