import { validateArticles, validateUploads } from '../src/lib/content-validation.mjs';

const articles = await validateArticles();
await validateUploads();
console.log(`Validated ${articles.length} article(s), including drafts.`);
