import { defineCollection } from 'astro:content';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

// Starlight docs live in src/content/docs/docs/, so every page is served
// under /atesor/docs/ and nothing collides with the landing pages in src/pages.
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  // UI string overrides for the docs (src/content/i18n/en.json).
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
