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
     * NOTE: the git tag is literally `beta`; `atesor-v1.2.0` is the release
     * *display name*, not a tag. No tag matches `atesor-v*`, so "latest tag
     * matching atesor-v<version>" cannot be resolved programmatically, and
     * /releases/latest points at a monthly `builds-*` package sweep instead
     * of the app release. Hence this explicit link. Re-tagging the release
     * as `atesor-v1.2.0` would let this become /releases/latest.
     */
    latestRelease: 'https://github.com/eclipse-atesor/atesor/releases/tag/beta',
    contributing: 'https://github.com/eclipse-atesor/atesor/blob/main/CONTRIBUTING.md',
    licenseFile: 'https://github.com/eclipse-atesor/atesor/blob/main/LICENSE',
    developerSite: 'https://akifejaz.github.io/gitme/',
  },
} as const;

/**
 * Where a build actually executes.
 *
 * `live` is load-bearing and must stay honest: as of today every build runs
 * under QEMU/binfmt emulation. README.md states native hardware "is in
 * process and will be added in a future release", and no remote-execution
 * path exists in src/. Cloud-V is already real in CI though — the workflows
 * pull prebuilt `cloudv10x/atesor-sandbox` images, and batch-port.yml carries
 * a TODO to move onto Cloud-V / RISE runners.
 *
 * Flip `live` to true for the hardware target ONLY once that lands.
 */
export const executionTargets = [
  {
    name: 'Emulated riscv64 sandbox',
    detail: 'Alpine (musl) + Debian (glibc), via QEMU/binfmt',
    live: true,
  },
  {
    name: 'Native RISC-V hardware',
    detail: 'on Cloud-V',
    href: 'https://cloud-v.co',
    live: false,
  },
] as const;

/**
 * Stats band.
 *
 * The package figures come from the ACTUAL published release artifacts on
 * github.com/eclipse-atesor/atesor/releases — all 8 releases enumerated via
 * the GitHub API, 3,956 build artifacts total, deduplicated by the package
 * stem in each `<pkg>-<date>-<time>-<platform>.zip` filename.
 *
 * Cross-checks that make these safe to publish:
 *   - all 622 released packages appear in .github/packages/full.json
 *     (701 unique URL stems) — nothing released is outside the catalog;
 *   - the 79 catalog packages never released are 91% accounted for by
 *     .github/packages/failed.json.
 *
 * Still deliberately excluded: any headline "success rate". The CI failure
 * report has no denominator, so a percentage there would be invented.
 */
export const stats = [
  {
    value: '622',
    label: 'packages published for RISC-V',
    src: 'GitHub releases (8 releases, 3,956 artifacts)',
  },
  {
    value: '584',
    label: 'verified on both musl and glibc',
    src: 'release artifacts, per-platform',
  },
  {
    value: '89%',
    label: 'of the 701-package catalog',
    src: '622 / 701 unique stems in full.json',
  },
  {
    value: '16',
    label: 'LLM-free recovery heuristics',
    src: 'src/graph.py',
  },
] as const;

/**
 * The problem. Every failure mode below is named AND handled in the code —
 * that pairing is the whole argument for the project.
 */
export const failureModes = [
  {
    title: 'Stale config.guess',
    error: 'configure: error: cannot guess build type',
    body:
      'Autotools aux scripts that predate RISC-V support reject the host ' +
      'triplet outright. Atesor regenerates them with autoreconf -fi.',
  },
  {
    title: 'x86-only SIMD',
    error: "fatal error: emmintrin.h: No such file",
    body:
      'SSE/AVX intrinsics have no portable RISC-V equivalent, and RVV cannot ' +
      'be assumed. Detected by an architecture scan before the build even starts.',
  },
  {
    title: 'The Go -buildvcs trap',
    error: 'error obtaining VCS status: detected dubious ownership',
    body:
      "The sandbox runs as root, so Go's VCS ownership check fails. " +
      '-buildvcs=false is baked into both images and applied as a recovery step.',
  },
  {
    title: 'musl versus glibc',
    error: "fatal error: execinfo.h: No such file or directory",
    body:
      'Alpine has no execinfo.h, backtrace() or mallinfo(). Atesor proves ' +
      'every package on both libc families rather than assuming one generalises.',
  },
  {
    title: 'Relocation truncated',
    error: 'relocation truncated to fit: R_RISCV_JAL',
    body:
      'Large functions overflow RISC-V’s default medlow code model. The ' +
      'build retries automatically with -mcmodel=medany.',
  },
  {
    title: 'Silent QEMU OOM',
    error: 'exit status 137, with empty stderr',
    body:
      'Emulated parallel builds get OOM-killed with no error text, masking the ' +
      'real cause. Detected heuristically and retried serialised at -j1.',
  },
] as const;

export const pillars = [
  {
    title: 'Scripted operations layer',
    file: 'src/scripted_ops.py',
    body:
      'Deterministic, zero-LLM repo inspection: clone and reset, build-system ' +
      'detection across 11 systems, per-ecosystem dependency extraction, and an ' +
      'architecture-pattern scan. This is what makes the pipeline cheap.',
    points: ['11 build systems detected', 'Zero LLM cost', 'Runs before any model call'],
  },
  {
    title: 'LangGraph state machine',
    file: 'src/graph.py',
    body:
      'A compiled StateGraph with per-node conditional routing and an embedded ' +
      'build, verify and fix subgraph. One AgentState dataclass is threaded through ' +
      'every node and mutated in place.',
    points: ['11 node registrations', '7 routing functions', 'Uniform error handling'],
  },
  {
    title: 'Platform abstraction',
    file: 'src/platforms.py',
    body:
      'One frozen profile per distro carries libc, target triplet, package-manager ' +
      'templates, canonical package maps and name corrections. Adding a sandbox is ' +
      'a single entry, and the rest of the code stays distro-agnostic.',
    points: ['Alpine / musl', 'Debian / glibc', 'One entry per new sandbox'],
  },
] as const;

export const featureGroups = [
  {
    group: 'Build & verification',
    items: [
      ['Native RISC-V builds', 'No cross-compilation, so no surprises at deploy time.'],
      ['ELF architecture verification', 'Every artifact confirmed riscv64; wrong-arch output hard-fails.'],
      ['Expected-artifact search', 'Hunts for the analyst’s expected outputs before tolerating a caveated pass.'],
      ['Artifact curation', 'Ranks output primary, secondary or noise so the recipe shows the real deliverable.'],
    ],
  },
  {
    group: 'Autonomy & recovery',
    items: [
      ['16 LLM-free heuristics', 'The most common failures are fixed deterministically.'],
      ['Evidence-grounded diagnosis', 'The fixer reads real source around each error reference, not just the message.'],
      ['Bounded investigation', 'One read-only round, at most four whitelisted commands.'],
      ['Error-loop detection', 'Three same-category failures in a row escalates instead of burning budget.'],
    ],
  },
  {
    group: 'Cost & safety',
    items: [
      ['Hard $1.00 cap per package', 'A runaway port cannot run up a bill.'],
      ['Real token accounting', 'Every call priced from reported usage; free-tier models bill zero.'],
      ['Command whitelist', 'Every shell command passes a regex validator inside the sandbox boundary.'],
      ['Deterministic fallbacks', 'Agents keep working when every LLM is rate-limited or down.'],
    ],
  },
  {
    group: 'Memory & scale',
    items: [
      ['Recipe cache', 'A repeat port skips all LLM and Docker work, with no API key needed.'],
      ['Per-sandbox cache keys', 'An Alpine hit never satisfies a Debian build.'],
      ['Few-shot auto-learning', 'Successful runs persist novel patterns, capped at 100 per agent.'],
      ['Parallel batch runs', 'One container per worker, avoiding apt and apk lock contention.'],
    ],
  },
] as const;

export const platforms = [
  {
    key: 'alpine',
    name: 'Alpine Linux',
    libc: 'musl',
    triplet: 'riscv64-alpine-linux-musl',
    note: 'Default sandbox',
  },
  {
    key: 'debian',
    name: 'Debian / Ubuntu',
    libc: 'glibc',
    triplet: 'riscv64-unknown-linux-gnu',
    note: 'Second libc family',
  },
] as const;

export const outputs = [
  ['{repo}_recipe.md', 'The replayable Markdown porting recipe.'],
  ['{repo}_report_*.md', 'Detailed per-run build report.'],
  ['{repo}_state_*.json', 'Full AgentState snapshot for debugging.'],
  ['{repo}_patches_*/', 'Every patch applied during the run.'],
  ['{repo}-*-{platform}.zip', 'Packaged artifact: recipe, manifest, sources, logs.'],
  ['agent-call_{repo}.log', 'Full LLM audit trail with tokens and cost.'],
] as const;

