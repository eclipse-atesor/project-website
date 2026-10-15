# Eclipse Atesor™ brand guide

## TL;DR

- **Name:** "Eclipse Atesor™" first on every page, then "Atesor". Never "ATESOR" or "Atesor AI". The command is `atesor-ai`.
- **Tagline:** From source to verified riscv64.
- **Definition (use it everywhere):** Eclipse Atesor is an open-source agentic framework that ports software to RISC-V. It builds each package natively on riscv64, repairs what breaks, checks that every binary is real riscv64 code, and writes a recipe that a person or a CI job can replay.
- **Mark:** a stone with one cut corner. One line inside it reverses direction on three rows, from an open ring (source) to a solid pad (binary).
- **Colours:** granodiorite, chalk and Egyptian blue. Malachite only means "verified".
- **Type:** the system UI font and the system monospace font. No web fonts, so no third-party requests.
- **Files:** `public/brand/`, `public/favicon.svg`, `public/favicon-32.png`, `public/apple-touch-icon.png`. PNGs come from `npm run logo`.

## Name

- The name is "Rosetta" read right to left, with one "t" dropped. The story is in the docs: `/docs/project/name/`.
- First mention on each page, in `<title>` and in the main heading: **Eclipse Atesor™** (Eclipse Foundation rule).
- After the first mention: **Atesor**.
- Do not write "ATESOR": all capitals read as an acronym.
- Do not use "Atesor AI" as a name. `atesor-ai` is the command and the package name, always in code font.
- Lowercase "atesor" appears only in the logo wordmark.
- Keep the word "Rosetta" in the name story only. Do not use it in a logo, a tagline, a domain or a package name: it is Apple's product name, and "Rosetta Stone" is a language-learning brand.

## Wording

| Use | Text |
| --- | --- |
| Tagline | From source to verified riscv64. |
| Short descriptor (150 characters): GitHub "About", meta description | Agentic framework that ports software to RISC-V. Native riscv64 builds, automatic repair, verified binaries and a replayable recipe for each package. |
| Definition: README, docs, PMI, `llm.txt`, talks | See TL;DR. |
| Purpose | Much open-source software has no riscv64 build yet. Porting a package repeats the same steps and the same failures. Atesor does these steps, fixes the known failures, and records the result as a recipe, so each port is done once and anyone can replay it. |

Voice:

- Plain engineer register. State the fact. Do not sell it.
- No slogans, no "powerful", "seamless", "simply", no exclamation marks, no emojis, no em dashes.
- Docs prose follows ASD-STE100 Simplified Technical English: active voice, short sentences, one instruction per sentence.
- Numbers come from a source with provenance: package counts from `public/assets/packages.json` (generated from GitHub Releases), other facts from `src/data/content.ts` with a citation. Do not publish success rates.

## Mark

The mark has three parts:

- **Stone with a cut corner.** The broken top of the Rosetta Stone, and the pin-1 corner of a chip package.
- **One line in three rows.** It starts on the right and reverses on each row, like boustrophedon writing. The rows recall the three scripts on the stone. The 45-degree bends are circuit-board trace bends.
- **Open ring and solid pad.** Source in, native riscv64 binary out.

Geometry: 512 × 512 grid, frame and trace stroke 26, round caps and joins. The SVG files are the source of truth.

| File | Use |
| --- | --- |
| `brand/atesor-mark.svg` | Full-colour mark on light grounds |
| `brand/atesor-mark-dark.svg` | Full-colour mark on dark grounds |
| `brand/atesor-mark-mono.svg` | One colour (`currentColor`), for print, stamps and masks |
| `brand/atesor-logo.svg`, `brand/atesor-logo-dark.svg` | Mark and wordmark, horizontal |
| `brand/atesor-wordmark.svg` | Wordmark only (`currentColor`) |
| `favicon.svg` | Heavier small-size mark; follows the light or dark scheme |
| `favicon-32.png`, `apple-touch-icon.png`, `brand/icon-192.png`, `brand/icon-512.png` | Browser and app icons |
| `brand/atesor-pmi-200.png` | Eclipse PMI logo field (200 × 200, transparent) |
| `brand/github-avatar-500.png` | GitHub organisation avatar |
| `brand/og-image.png` (1200 × 630), `brand/github-social-preview.png` (1280 × 640) | Link previews. Source: `scripts/og-image.html` |
| `site.webmanifest` | Web app manifest; uses `brand/icon-192.png` and `brand/icon-512.png` |

The docs page `/docs/project/brand/` shows every file with a preview and a download link. Keep it in step with this table.

Rules:

- Clear space on all sides: at least the size of the cut corner.
- Minimum size of the full mark: 24 px. Below 24 px, use `favicon.svg` (no source ring, heavier strokes).
- Do not rotate, stretch, outline, shadow or recolour the mark outside the palette.
- Do not put the mark on photos or busy patterns.
- The wordmark is custom-drawn line art in the same stroke style. Do not set "atesor" in a font as a logo.

### Third-party marks

- The landing page shows the RISC-V "RV" symbol on the verify step: `public/brand/third-party/riscv-symbol.svg`. It holds the first two paths of the official `RISC-V_Horizontal_Color.svg` from the riscv.org brand page, with the original colours and no other change; the wordmark is left out. Do not redraw, recolour or draw over it. Keep it on a white tile, because its colours are made for light grounds.
- The RISC-V style guide lists only the full horizontal and stacked logos, and no symbol-only form. To follow it strictly, use the full official logo instead of the symbol.
- The site footer credits it: "RISC-V and the RISC-V logo are registered trademarks of RISC-V International."
- RISC-V International allows free use for non-commercial projects that follow its brand guidelines (https://riscv.org/about/risc-v-branding-guidelines/). Commercial use is for member organisations only.

## Colour

| Token | Hex | Role |
| --- | --- | --- |
| Granodiorite | `#1B1E22` | Mark line on light grounds; dark surfaces |
| Granodiorite deep | `#111316` | Dark page ground |
| Chalk | `#ECEEEF` | Text and mark line on dark grounds |
| Paper | `#F2F2EF` | Light ground for the avatar and print |
| Egyptian blue | `#2142B0` | Pad on light grounds; filled buttons; links on light grounds |
| Egyptian blue, light | `#8CA3FF` | Pad, accents and links on dark grounds |
| Malachite | `#3FBF88` dark, `#2E9B6F` light | "Verified riscv64" only |
| Ochre | `#E0805F` dark, `#C0532F` light | Failures and danger only |

- One accent per view: Egyptian blue.
- Body text meets WCAG AA on every ground it sits on.
- The landing page tokens are in `src/styles/global.css`. The docs tokens are in `src/styles/docs.css`.

## Type

- Text: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
- Code, labels, counts, flags and paths: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`.
- Prose in the sans face; every machine-adjacent token in the mono face.

## Rollout outside this repository

These places still use the old name forms or no brand. The project lead updates them.

- **GitHub organisation `eclipse-atesor`:** avatar `brand/github-avatar-500.png`; description = short descriptor; website `https://eclipse.dev/atesor`.
- **Repository `eclipse-atesor/atesor`:** "About" = short descriptor; website `https://eclipse.dev/atesor/docs/`; social preview `brand/github-social-preview.png`; topics `risc-v`, `riscv64`, `porting`, `langgraph`, `llm-agents`, `eclipse`, `build-automation`.
- **Repository README and `llm.txt`:** first line = the definition; install URL `https://github.com/eclipse-atesor/atesor` (the README still points to `github.com/akifejaz/atesor-ai`, which is a 404).
- **Eclipse PMI:** logo field = `brand/atesor-pmi-200.png`; description = the definition.
- **Slides and papers:** "Atesor" instead of "ATESOR"; the new mark instead of the chip.
