// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

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
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Keep the published asset tree small and cache-friendly.
      assetsInlineLimit: 2048,
    },
  },
});
