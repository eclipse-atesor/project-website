# Eclipse Atesor™ — project website

Source and published output for **<https://eclipse.dev/atesor>**.

[![Verify site](https://github.com/eclipse-atesor/project-website/actions/workflows/verify-site.yml/badge.svg)](https://github.com/eclipse-atesor/project-website/actions/workflows/verify-site.yml)
[![Project state](https://img.shields.io/badge/Eclipse%20project-Incubating-f7941e)](https://projects.eclipse.org/projects/openhw.atesor)
[![Built with Astro](https://img.shields.io/badge/built%20with-Astro-0d121b)](https://astro.build)
[![Atesor](https://img.shields.io/badge/Eclipse-Atesor-2dd4bf)](https://github.com/eclipse-atesor/atesor)

## Develop

```bash
cd site
npm install
npm run dev          # http://localhost:4321/atesor
```

## Publish

```bash
cd site
npm run deploy:dry   # preview the change
npm run deploy       # build, then sync dist/ to the repo root
```

Then commit **both** the source change and the regenerated root output, and push
to `main`. The site is live within about five minutes.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Build to `site/dist` |
| `npm run deploy` | Build, check, and sync to the repo root |
| `npm run deploy:dry` | Show what deploy would change |
| `npm run manifest` | Refresh the `/downloads` index from GitHub Releases |
| `npm run check_spacing` | Prose lint (also runs inside deploy and CI) |

## Downloads index

The `/downloads` page reads `assets/packages.json`. A build step generates that
file from GitHub Releases, so the page makes no third-party request and no
visitor meets the GitHub rate limit. The cost is that a new release is invisible
until the file is regenerated.

`.github/workflows/refresh-downloads.yml` does that every Monday at 04:17 UTC.
It regenerates the index, rebuilds, and commits only if the releases moved. It
commits as `github-actions[bot]`, never as you, and it stages only the published
paths. Run it early from Actions -> **Refresh downloads index** -> *Run workflow*.

To refresh by hand instead:

```bash
cd site
npm run manifest
npm run deploy
```

Two limits to know. The workflow needs `contents: write`; if `main` is
protected, give it a bypass or change it to open a pull request. GitHub also
caps asset listings at 1,000 per release, so two older months list fewer builds
than the release holds.

## Layout

| Path | Role |
|---|---|
| `site/` | Astro + Tailwind source |
| `index.html`, `downloads/`, `assets/`, `_astro/` | **Published output — generated, never hand-edit** |
| `.published-files` | Manifest of the last deploy, used to clean up stale files |

The Eclipse Foundation job serves this repository's **root of `main` verbatim**.
There is no server-side build, which is why the generated output is committed
rather than just the source.

## Rules

These are requirements from the
[Eclipse Foundation project handbook](https://www.eclipse.org/projects/handbook/#trademarks-website),
not preferences.

- **`Eclipse Atesor™`** must be the first and most prominent reference on every
  page — in `<title>` and `<h1>`.
- **Incubation branding is mandatory** while the PMI state is `Incubating`.
- The footer keeps its Eclipse logo, the
  `Copyright © Eclipse Foundation AISBL. All Rights Reserved.` line, the
  trademark attribution, and links to eclipse.org, Privacy Policy, Terms of
  Use, Compliance and Legal Resources.
- **No third-party requests.** No CDN fonts, scripts or images. This keeps the
  site clear of the Foundation's third-party-data obligations, and is why the
  type is a system font stack and the downloads index is generated at build
  time rather than fetched from the GitHub API in the browser.
- The site is served from the **`/atesor` subpath**, so use the `url()` helper
  in `src/lib/url.ts` for every internal link and asset.
- Atesor is **MIT** licensed, not EPL-2.0.
- Every factual claim comes from `site/src/data/content.ts`, which cites its
  source per entry. Add numbers there with a citation, or not at all.

CI re-builds on every push and fails if the committed root drifts from a fresh
build, if a required footer link goes missing, or if the prose lint trips.

## Links

- Project page — <https://projects.eclipse.org/projects/openhw.atesor>
- Source — <https://github.com/eclipse-atesor/atesor>
- Mailing list — <https://accounts.eclipse.org/mailing-list/atesor-dev>
