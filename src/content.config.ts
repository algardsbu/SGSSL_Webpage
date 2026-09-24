import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import { validateArticles, validateUploads, validDate } from './lib/content-validation.mjs';

// Validate the complete collection before the loader can overwrite colliding IDs.
await validateArticles();
await validateUploads();

const articles = defineCollection({
  loader: glob({
    pattern: '*.md',
    base: './src/content/articles',
    generateId: ({ entry }) => entry.replace(/\.md$/, ''),
  }),
  schema: z.object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(320),
    date: z.preprocess(
      (value) => value instanceof Date ? value.toISOString().slice(0, 10) : value,
      z.string().refine(validDate, 'Use a valid YYYY-MM-DD date'),
    ),
    image: z.string().startsWith('/images/'),
    imageAlt: z.string().trim().min(1).max(500),
    gallery: z.array(z.string().startsWith('/images/')).max(12).default([]),
    published: z.boolean().default(false),
    facebook: z.boolean().default(false),
    facebookCaption: z.string().max(5000).default(''),
    instagram: z.boolean().default(false),
    instagramCaption: z.string().max(5000).default(''),
  }).strict(),
});

export const collections = { articles };
