import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { unified } from '@astrojs/markdown-remark';

// Parse embedded HTML before sanitizing it. No MDX or executable content.
// Syntax highlighting is off so no later plugin introduces untrusted markup.
export const markdownOptions = {
  syntaxHighlight: false,
  rehypePlugins: [rehypeRaw, rehypeSanitize],
};

export const markdownConfig = {
  syntaxHighlight: markdownOptions.syntaxHighlight,
  processor: unified({ rehypePlugins: markdownOptions.rehypePlugins }),
};
