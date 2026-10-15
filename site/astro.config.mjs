// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import starlight from '@astrojs/starlight';

// The Eclipse Foundation publishing job copies the repo root of `main`
// byte-for-byte to https://eclipse.dev/atesor — there is no server-side
// build. So we build here into ./dist and `npm run deploy` syncs that
// output to the repository root.
//
// `base: '/atesor'` is load-bearing: the site is served from a SUBPATH on
// a shared host, so root-absolute asset URLs would resolve against
// eclipse.dev/ and 404.
export default defineConfig({
  site: 'https://eclipse.dev',
  base: '/atesor',
  trailingSlash: 'ignore',
  outDir: './dist',
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  integrations: [
    // The documentation at /atesor/docs/. Pages are Markdown files in
    // src/content/docs/docs/. Search (Pagefind) runs in the browser, so the
    // docs make no third-party requests either.
    starlight({
      title: 'Eclipse Atesor™',
      description:
        'Documentation for Eclipse Atesor, an agentic framework that ports software to RISC-V: native riscv64 builds, automatic repair, verified binaries and replayable recipes.',
      logo: {
        light: './src/assets/brand/atesor-mark.svg',
        dark: './src/assets/brand/atesor-mark-dark.svg',
        alt: '',
      },
      favicon: '/favicon.svg',
      social: [
        { icon: 'github', label: 'Source on GitHub', href: 'https://github.com/eclipse-atesor/atesor' },
      ],
      editLink: {
        baseUrl: 'https://github.com/eclipse-atesor/project-website/edit/main/site/',
      },
      customCss: ['./src/styles/docs.css'],
      // The site had no 404 page before the docs, and Starlight's needs a docs entry.
      disable404Route: true,
      components: {
        Footer: './src/components/DocsFooter.astro',
      },
      head: [
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/atesor/apple-touch-icon.png' } },
        { tag: 'link', attrs: { rel: 'manifest', href: '/atesor/site.webmanifest' } },
        { tag: 'link', attrs: { rel: 'alternate', type: 'text/plain', title: 'llms.txt', href: '/atesor/llms.txt' } },
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://eclipse.dev/atesor/brand/og-image.png' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: 'https://eclipse.dev/atesor/brand/og-image.png' } },
      ],
      sidebar: [
        { label: 'Overview', link: '/docs/' },
        { label: 'Introduction', items: [{ autogenerate: { directory: 'docs/introduction' } }] },
        { label: 'Getting Started', items: [{ autogenerate: { directory: 'docs/getting-started' } }] },
        { label: 'Guides', items: [{ autogenerate: { directory: 'docs/guides' } }] },
        { label: 'Architecture', items: [{ autogenerate: { directory: 'docs/architecture' } }] },
        { label: 'Reference', items: [{ autogenerate: { directory: 'docs/reference' } }] },
        { label: 'Contributing', collapsed: true, items: [{ autogenerate: { directory: 'docs/contributing' } }] },
        { label: 'Project', collapsed: true, items: [{ autogenerate: { directory: 'docs/project' } }] },
      ],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Keep the published asset tree small and cache-friendly.
      assetsInlineLimit: 2048,
    },
  },
});
