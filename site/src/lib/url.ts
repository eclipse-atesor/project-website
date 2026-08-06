/**
 * Base-aware URL helper.
 *
 * The site is served from the SUBPATH https://eclipse.dev/atesor, so every
 * internal href and asset reference must carry the base. Astro exposes it as
 * `import.meta.env.BASE_URL` (which includes a trailing slash).
 */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Build an internal URL: url('/get-started') -> '/atesor/get-started' */
export function url(path = '/'): string {
  if (!path.startsWith('/')) path = `/${path}`;
  return `${BASE}${path}` || '/';
}
