/**
 * Guard against a specific Astro/JSX footgun.
 *
 * A newline between prose and an inline element collapses to nothing:
 *
 *   licensed under the
 *   <a href="...">MIT License</a>       ->  "licensed under theMIT License"
 *
 * This shipped four separate times during development (the MIT link, the
 * OpenHW Group link, `--platform debian`, and `on riscv64`), each time only
 * caught by eyeballing a screenshot. So: check it mechanically instead.
 *
 * SCOPE — only <p> elements are scanned, because that is where flowing prose
 * lives and where all four real defects occurred. Inline tags used as grid or
 * flex children (nav links, <strong>/<span> definition pairs, the wordmark)
 * are visually separated by CSS `gap`, not by a text space, so scanning them
 * produces nothing but false positives.
 *
 * Usage: node scripts/check-spacing.mjs <html-file>
 */
import { readFileSync } from 'node:fs';

const INLINE = 'a|code|strong|em|b|i|span|sup|sub|small|abbr';

/** Words that legitimately carry an internal capital. */
const ALLOWED = [
  'GitHub', 'GitLab', 'OpenHW', 'OpenAI', 'OpenRouter', 'OpenJDK', 'OpenSSL',
  'LangGraph', 'LangChain', 'LangSmith', 'AgentState', 'StateGraph',
  'PackageAnalysis', 'BuildPlan', 'TaskPlan', 'JavaScript', 'TypeScript',
  'YouTube', 'LinkedIn', 'JKube', 'RISCV', 'PyPI', 'McKinsey',
];

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/check-spacing.mjs <html-file>');
  process.exit(2);
}

let html = readFileSync(file, 'utf8');
html = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');

const inlineRe = new RegExp(`</?(?:${INLINE})\\b[^>]*>`, 'gi');
const hits = new Map();

/*
 * Structural check — the reliable one.
 *
 * A case heuristic only fires when the inline content happens to start with a
 * capital ("theMIT"). It cannot see "on" + "riscv64" or "Add" + "--platform".
 * So look at the markup instead: a word character butting straight against an
 * opening inline tag whose content also starts with a non-space is, in prose,
 * always a collapsed space.
 *
 * <sup>/<sub> are excluded — they legitimately attach (Atesor<sup>™</sup>).
 */
const ATTACHING = 'a|code|em|strong|b|i|abbr|small';
const openGlued = new RegExp(
  `([A-Za-z0-9])(<(?:${ATTACHING})\\b[^>]*>)([^\\s<])`,
  'gi'
);
const closeGlued = new RegExp(
  `([^\\s>])(</(?:${ATTACHING})>)([A-Za-z0-9])`,
  'gi'
);

for (const m of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
  const raw = m[1];
  const plain = raw
    .replace(inlineRe, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const g of raw.matchAll(openGlued)) {
    hits.set(`${g[1]}‹${g[3]}›  (no space before inline tag)`, plain.slice(0, 110));
  }
  for (const g of raw.matchAll(closeGlued)) {
    hits.set(`${g[1]}‹${g[3]}›  (no space after inline tag)`, plain.slice(0, 110));
  }
}

for (const m of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
  // Inline tags vanish with no separator — exactly what the browser renders.
  const text = m[1]
    .replace(inlineRe, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;|&[a-z]+;/gi, ' ');

  // Tokenise, then flag any word containing a lowercase->uppercase
  // transition. Matching whole tokens (rather than a sub-pattern) is what
  // catches "theMIT License", where the capital is followed by more capitals
  // and a trailing-lowercase pattern would slip straight past it.
  for (const w of text.matchAll(/[A-Za-z]{4,}/g)) {
    const word = w[0];
    if (!/[a-z][A-Z]/.test(word)) continue;
    if (ALLOWED.includes(word)) continue;
    hits.set(word, text.replace(/\s+/g, ' ').trim().slice(0, 110));
  }
  for (const w of text.matchAll(/[a-z]{3}\.[A-Z][a-z]{3,}/g)) {
    hits.set(w[0], text.replace(/\s+/g, ' ').trim().slice(0, 110));
  }
}

/*
 * Em- and en-dashes are not used in this project's copy. Rewrite the sentence
 * with a comma, colon or full stop instead. Checked against rendered text so
 * source comments are unaffected.
 */
const prose = html
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]+>/g, ' ');

const dashes = [];
for (const m of prose.matchAll(/[—–]/g)) {
  const ctx = prose.slice(Math.max(0, m.index - 55), m.index + 55).replace(/\s+/g, ' ').trim();
  dashes.push(`${m[0]}  in: …${ctx}…`);
}

let failed = false;

if (hits.size) {
  console.error('Missing space around an inline element inside <p>:\n');
  for (const [word, ctx] of hits) {
    console.error(`  ${word}\n    in: ${ctx}…\n`);
  }
  console.error("Fix with an explicit {' '} beside the inline tag in the .astro source.\n");
  failed = true;
}

if (dashes.length) {
  console.error(`Em/en-dash in rendered copy (${dashes.length}):\n`);
  for (const d of dashes.slice(0, 12)) console.error(`  ${d}`);
  console.error('\nRewrite with a comma, colon or full stop.');
  failed = true;
}

if (failed) process.exit(1);

console.log('spacing: clean, and no em/en-dashes in rendered copy');
