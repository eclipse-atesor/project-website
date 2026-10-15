import type { APIRoute } from 'astro';
import { project } from '../data/content';
import { SUMMARY, docsBySection, pageUrl } from '../lib/llms';

/** /atesor/llms.txt: a Markdown index of the docs for language models. */
export const GET: APIRoute = async () => {
  const sections = await docsBySection();
  const lines = [
    `# ${project.formalName}`,
    '',
    `> ${SUMMARY}`,
    '',
    'Atesor is an Eclipse Foundation project in incubation, under the OpenHW Group. It is licensed under MIT.',
    'It supports C, C++ and Go build systems, builds in Alpine (musl) and Debian/Ubuntu (glibc) riscv64 sandboxes under QEMU,',
    'and can also build on a real riscv64 machine over SSH. Performance mode (`--optimize`) builds tuned variants of a',
    'verified port and checks them; on real riscv64 hardware it accepts a variant only when it measures faster twice.',
    'The verified build never changes. The command-line tool is `atesor-ai`.',
    '',
  ];
  for (const { label, pages } of sections) {
    if (!pages.length) continue;
    lines.push(`## ${label}`, '');
    for (const p of pages) {
      lines.push(`- [${p.data.title}](${pageUrl(p)}): ${p.data.description ?? ''}`.trimEnd());
    }
    lines.push('');
  }
  lines.push(
    '## Optional',
    '',
    `- [Full docs as one file](${project.urls.website}/llms-full.txt): every docs page in Markdown.`,
    `- [Source code](${project.urls.repo}): the Atesor repository on GitHub.`,
    `- [Releases](${project.urls.releases}): the .deb package and the monthly package builds.`,
    `- [Package index](${project.urls.website}/downloads/): every published riscv64 package with its recipe.`,
    `- [Project page](${project.urls.pmi}): governance and committers at the Eclipse Foundation.`,
    ''
  );
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
