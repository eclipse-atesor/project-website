/**
 * Build the downloads manifest from GitHub Releases.
 *
 * WHY BUILD TIME, NOT VIEW TIME
 * -----------------------------
 * The reference dashboard (adash) calls api.github.com from the browser. This
 * site deliberately makes zero third-party requests, because loading remote
 * resources pulls an Eclipse Foundation project site into the Foundation's
 * third-party-data obligations. So the manifest is generated here and served
 * same-origin from /atesor/assets/packages.json.
 *
 * It also avoids the anonymous 60-req/hour rate limit hitting real visitors,
 * and means the page still works with a strict content policy.
 *
 * SHAPE
 * -----
 * Records are deliberately slim: the download URL and filename are both
 * derivable from (name, version, distro, tag), so storing them would roughly
 * double the payload for no gain. The page reassembles them.
 *
 * KNOWN LIMIT
 * -----------
 * GitHub's asset pagination stops at 1000 items per release. Two releases sit
 * exactly on that ceiling, so their asset lists may be incomplete. Rather than
 * silently under-report, each release carries `truncated: true` and the page
 * says so.
 *
 * Usage:
 *   node scripts/build-manifest.mjs            # uses `gh auth token` if present
 *   GITHUB_TOKEN=... node scripts/build-manifest.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync, execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OWNER = process.env.ATESOR_GH_OWNER ?? 'eclipse-atesor';
const REPO = process.env.ATESOR_GH_REPO ?? 'atesor';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../public/assets/packages.json');
const OUT_RECIPES = resolve(HERE, '../public/assets/recipes.json');
// STY-04: derive from the constants above rather than re-reading the env and
// repeating the defaults.
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main`;

/** `<name>-<YYYYMMDD>-<HHMMSS>-<distro>.<ext>` */
const ASSET = /^(.+)-(\d{8})-(\d{6})-([a-z0-9]+)\.(zip|tar\.gz|tgz|tar\.xz|tar\.bz2)$/;

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;

/**
 * Prefer the `gh` CLI when no token is in the environment: it already holds a
 * login, and shelling out to it means this script never has to read the
 * credential file itself. Falls back to anonymous fetch, which works but is
 * capped at 60 requests/hour — not enough for a full manifest build.
 */
const GH_CLI = (() => {
  if (TOKEN) return false;
  try {
    execSync('gh auth status', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'eclipse-atesor-website',
  ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
};

async function api(path) {
  if (GH_CLI) {
    // SEC-03: execFileSync passes argv directly with no shell, so OWNER/REPO
    // interpolated into `path` can never be reinterpreted as shell syntax.
    const out = execFileSync('gh', ['api', path], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(out);
  }
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) {
    throw new Error(
      `GitHub ${res.status} ${res.statusText} on ${path}` +
        (res.status === 403 ? ' — set GITHUB_TOKEN or run `gh auth login`' : '')
    );
  }
  return res.json();
}

async function allAssets(releaseId) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await api(`/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) return { assets: out, truncated: false };
  }
  // Ten full pages means we are sitting on GitHub's 1000-item ceiling.
  return { assets: out, truncated: true };
}

console.log(
  TOKEN ? 'auth: token' : GH_CLI ? 'auth: gh cli' : 'auth: NONE (60 req/hr — will likely fail)'
);

/* -------------------------------------------------------------------------
 * Side data, joined in at build time.
 *
 * adash reads the upstream repo URL out of each zip's internal manifest and
 * pre-extracts every recipe, which means downloading thousands of archives.
 * The same facts are already published as plain JSON in the atesor repo, so
 * join against those instead: two HTTP requests rather than ~4000.
 * ---------------------------------------------------------------------- */
async function raw(path) {
  const res = await fetch(`${RAW}/${path}`, { headers: { 'user-agent': 'eclipse-atesor-website' } });
  if (!res.ok) throw new Error(`raw ${res.status} on ${path}`);
  return res.json();
}

/** Artifact stems are the URL basename, which is how they map back. */
const stem = (u) => u.replace(/\.git$/, '').replace(/\/+$/, '').split('/').pop();

let catalog = new Map();
try {
  const full = await raw('.github/packages/full.json');
  const list = Array.isArray(full) ? full : (full.packages ?? []);
  let rejected = 0;
  for (const p of list) {
    if (!p?.url) continue;
    // SEC-01: only http(s) URLs are carried into the published manifest. A
    // `javascript:` value here would land in an href in the browser.
    if (!/^https?:\/\//i.test(p.url)) { rejected++; continue; }
    catalog.set(stem(p.url), { url: p.url, lang: p.lang });
  }
  if (rejected) console.warn(`  rejected ${rejected} non-http(s) source URL(s)`);
  console.log(`catalog: ${catalog.size} source URLs`);
} catch (e) {
  // BLD-05: previously this only warned, so a failed fetch silently published
  // a manifest with every source link missing and still exited 0.
  console.error(`FATAL: catalog fetch failed (${e.message})`);
  console.error('Refusing to write a manifest with no source links.');
  process.exit(1);
}

/**
 * Render a readable recipe from a cache entry's structured build plan.
 *
 * The cache stores entries in two shapes: newer ones inline the finished
 * `recipe_markdown`, older ones only keep `recipe_file` — a path like
 * `output/ecoji_recipe.md` that exists on whatever machine did the build and
 * is published nowhere. 217 entries are in that older shape, which is why a
 * naive "has recipe_markdown" count lands at ~206 rather than the full cache.
 *
 * Those entries still carry the whole `build_plan`, so reconstruct from it
 * instead of showing nothing.
 */
function planToMarkdown(rec) {
  const out = [];
  out.push('> Reconstructed from the cached build plan. The full narrative');
  out.push('> recipe ships inside the downloadable archive.');
  out.push('');
  const facts = [
    ['Build system', rec.build_system],
    ['Sandbox', rec.sandbox],
    ['Architecture', rec.architecture],
    ['Last built', rec.last_built?.slice(0, 10)],
    ['Build time', rec.build_duration_seconds && `${Math.round(rec.build_duration_seconds)}s`],
  ].filter(([, v]) => v);
  for (const [k, v] of facts) out.push(`${k}: ${v}`);

  const deps = rec.dependencies ?? [];
  if (deps.length) out.push('', '## Dependencies', deps.join(' '));

  for (const phase of rec.build_plan?.phases ?? []) {
    out.push('', `## ${phase.name}`);
    for (const c of phase.commands ?? []) out.push(c);
  }

  const patches = rec.patches ?? [];
  if (patches.length) {
    out.push('', `## Patches applied (${patches.length})`);
    for (const p of patches) out.push(typeof p === 'string' ? p : JSON.stringify(p));
  }

  // Artifacts are {type, path, role} records, not strings — String() on them
  // yields "[object Object]".
  const arts = rec.artifacts ?? [];
  if (arts.length) {
    out.push('', '## Artifacts');
    for (const a of arts) {
      if (typeof a === 'string') { out.push(a); continue; }
      const role = [a.role, a.type].filter(Boolean).join(', ');
      out.push(`${a.path ?? JSON.stringify(a)}${role ? `  (${role})` : ''}`);
    }
  }

  return out.join('\n');
}

let recipes = {};
try {
  const cache = await raw('data/recipe_cache.json');
  let inlined = 0;
  let derived = 0;
  for (const [pkg, sandboxes] of Object.entries(cache.packages ?? {})) {
    for (const [sandbox, rec] of Object.entries(sandboxes)) {
      if (rec?.recipe_markdown) {
        (recipes[pkg] ??= {})[sandbox] = rec.recipe_markdown;
        inlined++;
      } else if (rec?.build_plan?.phases?.length) {
        (recipes[pkg] ??= {})[sandbox] = planToMarkdown(rec);
        derived++;
      }
    }
  }
  console.log(
    `recipes: ${Object.keys(recipes).length} packages ` +
      `(${inlined} inlined, ${derived} rebuilt from the cached build plan)`
  );
} catch (e) {
  // BLD-05: same reasoning as the catalog — a silent empty recipe column
  // looks identical to "no package has a recipe".
  console.error(`FATAL: recipe cache fetch failed (${e.message})`);
  console.error('Refusing to write a manifest with no recipes.');
  process.exit(1);
}

const releases = await api(`/repos/${OWNER}/${REPO}/releases?per_page=100`);

let packages = [];
const releaseMeta = [];

for (const rel of releases) {
  if (rel.draft) continue;
  // Package sweeps are tagged builds-YYYY-MM[-NN]; anything else is an app release.
  if (!/^builds-\d{4}-\d{2}/.test(rel.tag_name)) continue;

  const { assets, truncated } = await allAssets(rel.id);
  let kept = 0;

  for (const a of assets) {
    const m = ASSET.exec(a.name);
    if (!m) continue;
    const [, name, date, time, distro, ext] = m;
    const cat = catalog.get(name);
    packages.push({
      n: name,
      v: `${date}-${time}`,
      d: distro,
      s: a.size,
      t: rel.tag_name,
      // Month, used for grouping. `builds-2026-07-01` is a retry shard of
      // `builds-2026-07`, so both collapse to 2026-07.
      m: rel.tag_name.replace('builds-', '').slice(0, 7),
      e: ext === 'zip' ? undefined : ext,
      c: a.download_count || undefined,
      u: cat?.url,
      l: cat?.lang,
      r: recipes[name] ? 1 : undefined,
    });
    kept++;
  }

  releaseMeta.push({
    tag: rel.tag_name,
    name: rel.name || rel.tag_name,
    published: rel.published_at,
    url: rel.html_url,
    count: kept,
    truncated,
  });
  console.log(`  ${rel.tag_name.padEnd(20)} ${String(kept).padStart(5)} packages${truncated ? '  (TRUNCATED at API ceiling)' : ''}`);
}

/*
 * Retry shards re-upload artifacts that the main sweep already published, with
 * byte-identical filenames — 740 of them. Listing the same build twice under
 * one month is noise, so keep the first occurrence. Releases arrive
 * newest-first, so that is the most recent shard, and either download URL is
 * valid because both releases hold the file.
 */
const before = packages.length;
const seen = new Set();
packages = packages.filter((p) => {
  const key = `${p.n}\0${p.v}\0${p.d}\0${p.m}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
const dropped = before - packages.length;
if (dropped) console.log(`\ndeduplicated ${dropped} artifacts republished by retry shards`);

// Newest build first.
packages.sort((a, b) => (a.v < b.v ? 1 : a.v > b.v ? -1 : a.n.localeCompare(b.n)));

const uniqueNames = new Set(packages.map((p) => p.n));
const bothLibc = [...uniqueNames].filter((n) => {
  const ds = new Set(packages.filter((p) => p.n === n).map((p) => p.d));
  return ds.has('alpine') && (ds.has('debian') || ds.has('ubuntu'));
});

// Only keep recipes for packages that actually have a published artifact,
// so the lazily-fetched blob carries nothing the table cannot reach.
const shipped = new Set(packages.filter((p) => p.r).map((p) => p.n));
recipes = Object.fromEntries(Object.entries(recipes).filter(([k]) => shipped.has(k)));

const manifest = {
  repo: `${OWNER}/${REPO}`,
  artifacts: packages.length,
  unique: uniqueNames.size,
  bothLibc: bothLibc.length,
  withRecipe: shipped.size,
  distros: [...new Set(packages.map((p) => p.d))].sort(),
  langs: [...new Set(packages.map((p) => p.l).filter(Boolean))].sort(),
  releases: releaseMeta,
  // Grouped by month: retry shards collapse into their parent sweep.
  months: [...new Set(packages.map((p) => p.m))].sort().reverse().map((m) => ({
    m,
    count: packages.filter((p) => p.m === m).length,
    truncated: releaseMeta.some((r) => r.tag.startsWith(`builds-${m}`) && r.truncated),
  })),
  packages,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(manifest));
writeFileSync(OUT_RECIPES, JSON.stringify(recipes));

const kb = (f) => (Buffer.byteLength(JSON.stringify(f)) / 1024).toFixed(0);
console.log(`\n${packages.length} artifacts, ${uniqueNames.size} unique packages, ${bothLibc.length} on both libc`);
console.log(`${packages.filter((p) => p.u).length} with a source link, ${shipped.size} with a recipe`);
console.log(`wrote ${OUT} (${kb(manifest)} KB)`);
console.log(`wrote ${OUT_RECIPES} (${kb(recipes)} KB, fetched on demand)`);
