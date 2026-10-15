// @ts-check
import { readdir, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pagefind from 'pagefind';

/**
 * Build the Pagefind search index again, from the pages in sorted order.
 *
 * Starlight indexes dist/ with Pagefind's addDirectory(). That reads the
 * pages in file-system order, which is not the same on two machines, and
 * the index files (pagefind-entry.json, *.pf_meta, index/*.pf_index)
 * depend on that order. So a CI build never gave the same bytes as the
 * committed root, and verify-site.yml failed. A sorted order gives the
 * same index on every machine.
 *
 * Put this integration after starlight(), so that it runs after Starlight
 * has written its index.
 *
 * @returns {import('astro').AstroIntegration}
 */
export default function sortedSearchIndex() {
  return {
    name: 'atesor:sorted-search-index',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const out = join(root, 'pagefind');
        const pages = (await readdir(root, { recursive: true }))
          .filter((f) => f.endsWith('.html'))
          .sort();

        // Remove Starlight's index first, so that no file of it stays behind.
        await rm(out, { recursive: true, force: true });

        const fail = (/** @type {string[]} */ errors) => {
          if (errors.length) throw new Error(`Pagefind: ${errors.join('; ')}`);
        };
        try {
          const { index, errors } = await pagefind.createIndex();
          fail(errors);
          for (const sourcePath of pages) {
            const added = await index.addHTMLFile({
              sourcePath,
              content: readFileSync(join(root, sourcePath), 'utf8'),
            });
            fail(added.errors);
          }
          fail((await index.writeFiles({ outputPath: out })).errors);
        } finally {
          await pagefind.close();
        }
        logger.info(`Search index built again from ${pages.length} pages in sorted order.`);
      },
    },
  };
}
