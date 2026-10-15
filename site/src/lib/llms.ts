import { getCollection, type CollectionEntry } from 'astro:content';
import { project } from '../data/content';

/**
 * Shared data for /llms.txt and /llms-full.txt (https://llmstxt.org).
 *
 * Both files are generated from the docs collection at build time, so they
 * never drift from the published docs. The section order matches the
 * Starlight sidebar in astro.config.mjs.
 */
export const SECTIONS = [
  ['introduction', 'Introduction'],
  ['getting-started', 'Getting Started'],
  ['guides', 'Guides'],
  ['architecture', 'Architecture'],
  ['reference', 'Reference'],
  ['contributing', 'Contributing'],
  ['project', 'Project'],
] as const;

export const SUMMARY =
  'Eclipse Atesor is an open-source agentic framework that ports software to RISC-V. ' +
  'It builds each package natively on riscv64, repairs what breaks, checks that every ' +
  'binary is real riscv64 code, and writes a recipe that a person or a CI job can replay.';

export type Doc = CollectionEntry<'docs'>;

export const pageUrl = (doc: Doc) => `${project.urls.website}/${doc.id.replace(/\/index$/, '')}/`;

/** Docs pages grouped by sidebar section, each group in sidebar order. */
export async function docsBySection() {
  const docs = await getCollection('docs');
  return SECTIONS.map(([dir, label]) => {
    const pages = docs
      .filter((d) => d.id.startsWith(`docs/${dir}/`))
      .sort(
        (a, b) =>
          (a.data.sidebar?.order ?? 999) - (b.data.sidebar?.order ?? 999) ||
          a.data.title.localeCompare(b.data.title)
      );
    return { dir, label, pages };
  });
}
