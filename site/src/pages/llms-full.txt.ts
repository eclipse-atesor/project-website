import type { APIRoute } from 'astro';
import { project } from '../data/content';
import { SUMMARY, docsBySection, pageUrl } from '../lib/llms';

/** A reader of this file has no base URL, so make site links absolute. */
const absoluteLinks = (md: string) =>
  md.replace(/(\]\(|(?:href|src)=")\/atesor\//g, `$1${project.urls.website}/`);

/** /atesor/llms-full.txt: every docs page in Markdown, in sidebar order. */
export const GET: APIRoute = async () => {
  const sections = await docsBySection();
  const out = [`# ${project.formalName}`, '', `> ${SUMMARY}`, ''];
  for (const { label, pages } of sections) {
    for (const p of pages) {
      out.push(
        '---',
        '',
        `# ${p.data.title}`,
        '',
        `Section: ${label}`,
        `URL: ${pageUrl(p)}`,
        '',
        absoluteLinks((p.body ?? '').trim()),
        ''
      );
    }
  }
  return new Response(out.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
