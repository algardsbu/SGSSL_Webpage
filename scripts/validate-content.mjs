import { validateArticles, validateUploads } from '../src/lib/content-validation.mjs';
import { readFile } from 'node:fs/promises';
import { validateEvents } from '../src/lib/calendar.mjs';

const articles = await validateArticles();
await validateUploads();
const events = validateEvents(JSON.parse(await readFile('src/data/events.json', 'utf8')));
console.log(`Validated ${articles.length} article(s), including drafts.`);
console.log(`Validated ${events.length} calendar event(s), including drafts.`);
