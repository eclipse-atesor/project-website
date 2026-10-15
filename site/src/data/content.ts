/**
 * Single source of truth for every factual claim on the site.
 *
 * Each entry is traceable to the Eclipse Atesor codebase or to the Eclipse
 * Foundation PMI. Do NOT add a number here without a `src` note saying where
 * it came from. See the README (Rules) for the accuracy rules.
 *
 * Ground truth is `src/graph.py` and `PROJECT.md` in the atesor repo — the
 * README's architecture section is stale and must not be used.
 */

export const project = {
  /** PMI formal name. Handbook requires this exact form, with ™, as the
   *  first and most prominent reference on every page. */
  formalName: 'Eclipse Atesor',
  /** Project lead / committer, credited in the footer. */
  developer: 'Akif Ejaz',

  summary:
    'An agentic framework that automates porting software to RISC-V: ' +
    'libraries, packages and whole applications. A LangGraph state machine ' +
    'detects the build system, resolves dependencies, compiles and tests each ' +
    'package natively on riscv64, and repairs what breaks, returning verified ' +
    'binaries and a replayable porting recipe.',

  /** Brand wording (site/BRAND.md). The descriptor is 150 characters, for
   *  meta descriptions and the GitHub "About" box; the definition is the
   *  one-paragraph answer to "what is Atesor" used everywhere else. */
  descriptor:
    'Agentic framework that ports software to RISC-V. Native riscv64 builds, ' +
    'automatic repair, verified binaries and a replayable recipe for each package.',
  definition:
    'Eclipse Atesor is an open-source agentic framework that ports software to ' +
    'RISC-V. It builds each package natively on riscv64, repairs what breaks, ' +
    'checks that every binary is real riscv64 code, and writes a recipe that a ' +
    'person or a CI job can replay.',
  tagline: 'From source to verified riscv64.',

  urls: {
    // Verified live. The README's github.com/akifejaz/atesor-ai is a 404.
    repo: 'https://github.com/eclipse-atesor/atesor',
    website: 'https://eclipse.dev/atesor',
    pmi: 'https://projects.eclipse.org/projects/openhw.atesor',
    developer: 'https://projects.eclipse.org/projects/openhw.atesor/developer',
    who: 'https://projects.eclipse.org/projects/openhw.atesor/who',
    governance: 'https://projects.eclipse.org/projects/openhw.atesor/governance',
    contact: 'https://projects.eclipse.org/projects/openhw.atesor/contact',
    parent: 'https://projects.eclipse.org/projects/openhw',
    mailingList: 'https://accounts.eclipse.org/mailing-list/atesor-dev',
    releases: 'https://github.com/eclipse-atesor/atesor/releases',
    /**
     * The application release carrying the packaged CLI.
     *
     * v0.2.0 (2026-10-01) carries `atesor-ai_0.2.0_amd64.deb` and its
     * .sha256. /releases/latest points at a monthly `builds-*` package sweep
     * instead of the app release, hence this explicit link. Update it when
     * the next application release is tagged.
     */
    latestRelease: 'https://github.com/eclipse-atesor/atesor/releases/tag/v0.2.0',
    contributing: 'https://github.com/eclipse-atesor/atesor/blob/main/CONTRIBUTING.md',
    licenseFile: 'https://github.com/eclipse-atesor/atesor/blob/main/LICENSE',
    developerSite: 'https://akifejaz.github.io/gitme/',
  },
} as const;
