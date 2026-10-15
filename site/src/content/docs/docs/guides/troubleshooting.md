---
title: Troubleshooting
description: Common failures by symptom, with the error categories, what Atesor fixes by itself, what an escalation or a not-verified result means, and what you can do.
sidebar:
  order: 6
---

This page lists the common failures of Eclipse Atesor™ by symptom. For each failure, it tells you what you see, what Atesor does by itself, and what you can do. Atesor puts each build error into a category, and the category decides the next step of the run.

## Where do I find the cause of a failure?

When a run does not succeed, the console shows `PORTING STOPPED / FAILED` and the final status. Then it shows these items:

- `Last Error Capture`: the category, the severity and the first 500 characters of the last error.
- `Agent Decision Audit`: the last 10 events of the run.

The output directory and the logs directory hold more data:

| File | Content |
|---|---|
| `<repo>_report_<time>.md` | The status, the metrics, the error history and recommendations. |
| `<repo>_state_<time>.json` | The full run state, with the escalation report in `context_cache.escalation_report`. |
| `<repo>_patches_<time>/` | The patches that the fixer applied. |
| `logs/agent_<repo>.log` | The full debug log of the run. |
| `logs/agent-call_<repo>.log` | Each LLM call, with its prompt and response. |

Add `--verbose` to see the agent messages in the console. See [Output files](/atesor/docs/reference/output-files/) for the locations.

## What do the error categories mean?

`classify_error()` in `src/state.py` compares the error text with ordered patterns. The first rule that matches gives the category. The category decides the next step:

| Category | Typical error text | Next step |
|---|---|---|
| `DEPENDENCY` | `unable to locate package`, `No package 'x' found`, CMake `Could not find`, `not found`, `No such file` | The scout makes a new plan. |
| `MISSING_TOOLS` | `command not found`, `go.mod requires go >=`, `requires rustc` | The scout makes a new plan. |
| `COMPILATION` | `syntax error`, `undeclared`, `implicit declaration`, `error[E0...]` | The build-fix loop. |
| `LINKING` | `undefined reference`, `relocation truncated to fit`, `cannot find -l`, `__atomic_load_` | The build-fix loop. |
| `ARCHITECTURE` | `immintrin.h`, `unsupported architecture`, `-msse`, `-mavx`, `-march=native` options, `invalid instruction mnemonic` | The build-fix loop. |
| `CONFIGURATION` | `config.guess: unable to guess system type`, `configure: error`, `CMake Error`, `no rule to make target` | The build-fix loop. |
| `NETWORK` | `timed out`, `connection`, `could not read Username`, `unreachable` | The build-fix loop. |
| `RATE_LIMIT` | `rate limit`, `429`, `too many requests`, `quota exceeded` | The build-fix loop. |
| `UNKNOWN` | Any other text | The build-fix loop. |
| `PERMISSION` | `permission denied`, `access denied`, `forbidden` | Escalation. |
| `DISK_SPACE` | `no space left`, `virtual memory exhausted`, `exit 137`, a bare `Killed` | Escalation. |
| `LICENSE_INCOMPATIBLE`, `REQUIRES_HARDWARE`, `ARCHITECTURE_IMPOSSIBLE` | `classify_error()` does not give these categories. | Escalation. |

In the build-fix loop, the builder runs the plan again, and the fixer (an LLM agent) proposes a fix after each failure. Some error texts make the scout plan again, one time for each text. Examples are `./configure: No such file or directory`, `unable to locate package` and `inconsistent vendoring`.

The severity is `low`, `medium` or `high`. A failed `which` probe is `low`. `PERMISSION`, `DISK_SPACE` and the three other blocker categories are `high`. A failed command such as `git clone`, `apt-get update` or `apk add` is also `high`.

## What does "escalated" mean?

An escalation stops the run and asks a person to continue. The final status is `ESCALATED`, and the exit code is 1. The run escalates in these cases:

1. The run used all its attempts. The limit is `--max-attempts`, by default 5. Each recorded error counts as one attempt.
2. The last three errors have the same category and the same first error line. Atesor removes paths and numbers before it compares the lines.
3. The last error is in a blocker category: `PERMISSION`, `DISK_SPACE`, `LICENSE_INCOMPATIBLE`, `REQUIRES_HARDWARE` or `ARCHITECTURE_IMPOSSIBLE`.
4. The cost of the run passed $1.00. See [Cost control](/atesor/docs/guides/cost-control/).
5. A step of the run raised an error, for example a lost SSH connection on the native target.
6. The clone failed, or the analyst step gave no result.

**What you get:**

- The report, with `Manual intervention required`, the reason and the error history.
- The escalation report in the state file. It holds the attempts, the cost, the duration, the last error, the last 5 fixes, the architecture issues of high severity, the escalation reason and the last 5 failures with their commands.
- The patches that the fixer applied.
- No recipe, no recipe cache entry, no few-shot example and no zip.

**What you can do:**

- Read the last error and its category first. They show the step that stopped the run.
- If the run used all its attempts, and each attempt failed with a different error, run again with a higher `--max-attempts`.
- Run the package on the other platform. A failure on one libc family only points to a libc difference.
- Use the report, the patches and the logs to finish the port by hand.

## What does "not verified" (exit code 3) mean?

The build commands succeeded, but the artifact scan found no proof of riscv64 output. The console shows `PORTING FINISHED, NOT VERIFIED` and the reason. The report status is `SUCCESS, NOT VERIFIED (no riscv64 output proven)`.

The scan gives one of these reasons:

- `the build produced no ELF executable or library`: for example a header-only library or a package of scripts.
- `the scan stopped after <N> candidate files, before it read every build output`.
- `artifact scan failed: ...`.

**What Atesor does:** It writes the recipe and the report, and with `--package` the zip. It does not write a recipe cache entry or few-shot examples. `batch_test.py` counts the result as `UNVERIFIED`, not as a pass.

**What you can do:** For a header-only or script package, check the install tree yourself. Otherwise, check that the build plan builds the main targets of the package.

A recipe cache hit also exits with 3 when the cache entry has no verified verdict. The console then shows `CACHED (not rebuilt), NOT VERIFIED`. Run again with `--force` to build and verify the package. See [Verification](/atesor/docs/architecture/verification/).

## Setup problems

### No binfmt handler for riscv64

**What you see:** `qemu-riscv64 binfmt handler not detected; attempting to register`. When the registration fails: `ERROR: qemu-riscv64 is not registered in /proc/sys/fs/binfmt_misc.` Without the handler, every riscv64 container exits with `exec format error`.

**What Atesor does:** On the QEMU target, Atesor reads `/proc/sys/fs/binfmt_misc/qemu-riscv64`. When the handler is missing, Atesor runs `docker run --privileged --rm tonistiigi/binfmt --install riscv64` one time.

**What you can do:** Run the command yourself, then run Atesor again:

```bash
docker run --privileged --rm tonistiigi/binfmt --install riscv64
```

The native target does not use binfmt.

### Docker does not respond

**What you see:** `ERROR: Docker is not running or not accessible`.

**What you can do:** Start the Docker daemon, and make sure that your user can use it. Then run the command again.

### The platform does not match the container

**What you see:** `ERROR: Platform mismatch` with the distro of the container and the selected platform.

**What Atesor does:** It stops before the build, because the package commands of one distro do not work on the other.

**What you can do:** Remove the old container with the command that the error gives, for example `docker rm -f atesor-ai-sandbox`. Then run again. See [Sandboxes](/atesor/docs/guides/sandboxes/).

### The API key is missing

**What you see:** For example `ERROR: GOOGLE_API_KEY not found in environment`, `ERROR: ANTHROPIC_API_KEY not found in environment`, or `ERROR: Unknown provider: <name>`. With `LLM_PROVIDER=anthropic`, a missing Python package gives `ERROR: langchain-anthropic is not installed (pip install -r requirements.txt)`.

**What Atesor does:** It checks the key of `LLM_PROVIDER` before a run with `--repo`. A missing key, and the placeholder `your_key_here`, stop the run with exit code 1. When `LLM_PROVIDER` is not set, Atesor expects `GOOGLE_API_KEY` for `gemini`. A recipe cache hit, `--setup-only` and `--probe` need no key. `--optimize` always needs a key, also when the cache has a verified recipe.

**What you can do:** Put the key in a `.env` file. Atesor reads these files in this order, and the first value of a key wins:

1. A `.env` in the directory of `main.py` or in a parent directory. In a source checkout, this is the `.env` in the root of the checkout. The search starts at `main.py`, not at the current directory.
2. `$ATESOR_HOME/.env`, when you set `ATESOR_HOME`.
3. `~/.config/atesor-ai/.env` (`$XDG_CONFIG_HOME/atesor-ai/.env`).
4. `~/.local/share/atesor-ai/.env` (`$XDG_DATA_HOME/atesor-ai/.env`).

A variable that is already in the environment wins over all files. A key that is present can still fail, for example when its quota is empty. In a source checkout, this script sends one small real request to the provider that you name:

```bash
python3 .github/scripts/check_llm_providers.py -p openrouter
```

See [Configure the LLM](/atesor/docs/getting-started/configure-llm/).

### The native preflight fails

**What you see:** `Native preflight stopped at rung <N>` or `Native preflight failed. Still required on the machine:`, with a list of items and fix commands.

**What you can do:** Give the list to the owner of the machine. Then run `atesor-ai --target native --preflight` again. See [Native RISC-V machine](/atesor/docs/guides/native-riscv/).

## Build failures

### A stale config.guess

**What you see:** `config.guess: unable to guess system type`, `machine 'riscv64' not recognized`, or `invalid configuration`. The `config.guess` and `config.sub` scripts of the project are older than riscv64 support.

**What Atesor does:**

- The scripted analysis flags each `config.guess` and `config.sub` whose timestamp is before 2018-02-22, with high severity.
- The error goes to the fixer as `CONFIGURATION`. The fixer prompt tells it to copy new scripts from automake (`cp /usr/share/automake-*/config.* .`) or to run `autoreconf -fi`, and to use `--build`, never `--host`.
- When a project has no committed `configure` script, the builder first runs `autogen.sh`, `buildconf`, `bootstrap` or `autoreconf -fi`.

**What you can do:** Copy the scripts from the automake of the sandbox into the project, or run `autoreconf -fi`. Then run the build again.

### x86 SIMD intrinsics

**What you see:** `'immintrin.h' file not found`, `unknown type name '__m128'`, `undefined reference to '_mm_*'`, or an unknown option such as `-msse2`, `-mavx` or `-march=native`.

**What Atesor does:**

- The scripted analysis flags includes of x86 and ARM intrinsic headers, and hard `-m` flags in build files, as architecture issues.
- With a critical issue, or 3 or more issues of high severity, Atesor does not use a default plan. The LLM scout makes the plan, and its prompt tells it to turn off optional SIMD features.
- A build error of this type goes to the fixer as `ARCHITECTURE`. The prompt lists the fixes: SIMDe, a scalar C fallback, RVV intrinsics when the V extension is present, or a build option that turns SIMD off.
- When the artifact scan finds a build output for another architecture, the run also goes to the fixer as `ARCHITECTURE`.

**What you can do:** Look for a build option of the project that turns off SIMD or assembly. If none exists, add a portable fallback in the code.

### Go -buildvcs errors

**What you see:** `error obtaining VCS status`, `Use -buildvcs=false`, or `dubious ownership`. The sandbox runs as root, which trips the VCS ownership check of Go.

**What Atesor does:**

- Both images set `GOFLAGS=-buildvcs=false`.
- The default Go plans use `go build -buildvcs=false`.
- When a `go build` or `go install` still fails with one of these texts, the builder adds `-buildvcs=false` and runs it one more time.
- The builder removes `-buildvcs=false` from other Go commands, for example `go mod tidy`, because they do not accept it.

**What you can do:** Normally nothing. If you replay a recipe outside the sandbox, keep `-buildvcs=false` on `go build`.

### musl and glibc header differences

**What you see:** On Alpine, for example `execinfo.h: No such file or directory`, `undefined reference to 'backtrace'`, `undefined reference to 'mallinfo'`, `'REG_RIP' undeclared` or `'sys/cdefs.h' file not found`.

**What Atesor does:**

- On Alpine, the scout and fixer prompts state that musl lacks some GNU extensions. They give the fixes: guard the code with `#ifdef __GLIBC__`, or use libunwind for backtraces. `libexecinfo` is no longer in Alpine, so the prompt says not to install it.
- Atesor replaces package names of the other distro in install commands, for example `libssl-dev` with `openssl-dev` on Alpine.

**What you can do:** Run the same package with `--platform debian`. If it builds there, the problem is a musl difference.

### Relocation truncated to fit

**What you see:** `relocation truncated to fit: R_RISCV_...`. The default RISC-V code model cannot reach the address in large code.

**What Atesor does:** When the error text has `relocation truncated` and `R_RISCV`, the builder runs the command one more time with `CFLAGS='-mcmodel=medany' CXXFLAGS='-mcmodel=medany'` in front. If that works, the new command goes into the plan and the recipe. Otherwise the error goes to the fixer as `LINKING`.

**What you can do:** The retry has no effect when the build system ignores `CFLAGS` and `CXXFLAGS` from the environment. In that case, add `-mcmodel=medany` to the compiler flags of the project, for example in its CMake or Makefile flags.

### QEMU out of memory (exit 137)

**What you see:** A build command that ends with exit code 137, or a parallel build that stops with no output. An error with exit code 137 gets the category `DISK_SPACE`.

**What Atesor does:**

1. The builder treats exit 137 as a probable QEMU out-of-memory kill. It runs the command one more time with one job: `make -j1`, `ninja -j1`, `go build -p 1` with `GOMAXPROCS=1`, `cargo build -j 1`, or `MAKEFLAGS=-j1` for `pip install`.
2. If the command still fails with exit 137, the run escalates, because `DISK_SPACE` is a blocker category.

Both images set `GOTOOLCHAIN=local`, so Go does not download a new toolchain in the middle of a build. Such downloads can also end with exit 137 under QEMU.

**What you can do:**

- On the QEMU target, the sandbox container has an 8 GB memory limit. Free memory on the host, or use the [native target](/atesor/docs/guides/native-riscv/), which sets no memory limit.
- Exit 137 can also come from the time limit of a command. The default limit of a build command is 1800 seconds. Atesor stops the command inside the sandbox with `timeout --signal=KILL`, 30 seconds before that limit. Check the duration of the command in `agent_<repo>.log`.

### Missing -dev packages

**What you see:** `fatal error: <header>.h: No such file or directory`, `No package '<name>' found`, CMake `Could not find <name>`, or `Unable to locate package`.

**What Atesor does:**

- For a missing header, the builder maps the header to a distro package through the `package_map` of the platform profile. It installs the package and runs the command one more time. This step needs no LLM.
- When an install command names a package that does not exist on riscv64, the builder installs the packages one by one and skips the missing ones.
- The error goes to the scout as `DEPENDENCY`, and the scout makes a new plan with the missing packages.

**What you can do:** Find the package name for the distro of the sandbox, and check that it exists for riscv64. A header that is not in the `package_map` needs a person or the scout to find the package.

### Command blocked by safety validation

**What you see:** `Command blocked by safety validation: <reason>` in the log.

**What Atesor does:** Atesor compares each command with a whitelist of allowed command patterns before the command runs. Each part of a chained command must match. Atesor blocks a command that does not match, and the command counts as failed.

**What you can do:** Read the blocked command in `agent_<repo>.log`. A blocked command usually comes from an LLM proposal, and the next fix attempt uses another command.

## Performance mode problems

These problems apply to runs with `--optimize`. Performance mode never changes the exit code of the port. The console shows its answer in the `Optimized:` line, and the report has the full record. See [Performance mode](/atesor/docs/guides/optimize/).

### Atesor skipped performance mode

**What you see:** `Optimized: NO: performance mode was skipped`, with one of these reasons after `Why:`:

- `the port is not verified, so there is no baseline`
- `no tune applies to this machine and build system`
- `the verified build has no repeatable command or no artifact in the tree`

**What you can do:** For the first reason, make the port verified first. See [What does "not verified" (exit code 3) mean?](/atesor/docs/guides/troubleshooting/#what-does-not-verified-exit-code-3-mean). For the second reason, run `--probe`. It shows the extensions, the core and the compilers that the tunes need.

### The machine gives wrong data

**What you see:** A `Health` line such as `3 of 40 zlib round trips gave wrong data (CPU 0: 1, CPU 1: 2)`, then `Fix: make the machine stable first (a lower CPU frequency, a memory test), then run again`.

**What Atesor does:** It stops before it builds anything, because no time measurement on that machine is reliable. The status is `not measured`.

**What you can do:** Ask the owner of the machine to lower the CPU frequency or to test the memory. Then run again.

### No tune could be timed

**What you see:** `Optimized: NO: no tune could be timed`. On native hardware, the reason often starts with `no workload, so no tune was built or measured`.

**What Atesor does:** It tries each workload source in order and records why each one failed. Without a workload, a native run builds no tune.

**What you can do:** Read the `Notes` list in the `Performance Mode (--optimize)` section of the report. It has one note for each workload source. A console line that starts with `port problem:` means that the verified build itself crashed on the machine. The report lists that crash under `Warnings`.

### A gain is not confirmed

**What you see:** `Optimized: NO: no faster tune was confirmed`, with `Fix: run again with a larger ATESOR_OPTIMIZE_BUDGET`.

**What Atesor does:** A tune was faster in its first measurement, but the time limit ended before its second check. Atesor does not accept a tune without a second check.

**What you can do:** Set a larger `ATESOR_OPTIMIZE_BUDGET`, in seconds. The default is 3600.

### No compiler tune

**What you see:** The tune list has no `compiler` tune.

**What you can do:** The compiler tune needs clang in the sandbox image. Only `Dockerfile.native` installs it. Build the native image again one time with `python3 main.py --target native --setup-only --rebuild`.

### The CPU model or `--probe` is rejected

**What you see:** `ERROR: --emulate-cpu '<model>' is not a QEMU CPU model`, or `ERROR: --probe runs alone. Remove --repo, or remove --probe to port the repository.` The exit code is 1.

**What you can do:** Give a model that starts with a letter, for example `rva22u64`. Run `--probe` without `--repo`.
