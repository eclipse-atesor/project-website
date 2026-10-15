---
title: Limitations
description: What Atesor does not do today, what QEMU emulation cannot tell you, and the fixed limits on attempts, cost, time and file counts.
sidebar:
  order: 4
---

This page lists the current limits of Eclipse Atesor™ in the code on the `main` branch. Read it before you depend on a result, so that you know what a verified port proves and what it does not prove.

## Which ecosystems does Atesor not fully support?

- **Default build plans exist for four build systems only:** CMake, Make, autotools and Go. For Meson, Cargo, Python and every other build system, the LLM scout must write the plan.
- **Rust, Python and Node.js are not first-class targets.** Atesor has only partial heuristics for them. It detects an npm project only when the project has a `package-lock.json` file or a build script.
- **Gradle, Maven and Bazel have no special support.** Atesor detects their build files, but it has no default plan and no recovery heuristic for them.
- **Atesor cannot verify header-only and script-only packages.** They produce no riscv64 binary, so the result is `unverified` and the exit code is 3.

## What can a verified port not tell you?

A `verified` verdict means that the ELF header of each build output shows a 64-bit RISC-V file, and that no output is for another architecture. It does not prove these points:

- The program runs correctly. The package's own test suite runs one time after the build (`ctest`, `meson test`, `go test`, `cargo test`, `make check` or `make test`). The result goes into the report, but it never fails the port.
- The program runs well on a specific board. On the QEMU target, the build and the tests run under QEMU user-mode emulation on an x86 or ARM host. A port makes no performance measurement. Only performance mode (`--optimize`) on the native target measures speed.
- The build is complete. Atesor checks the outputs that the build produced. If the build makes some riscv64 outputs but skips a target, the port still counts as verified. Atesor looks for the expected artifacts from the analysis only when the build tree has no output.

For results from real hardware, use the [native target](/atesor/docs/guides/native-riscv/).

## Why does Atesor not cross-compile?

Atesor builds only inside a riscv64 container, with the riscv64 compilers of the sandbox image. It never uses an x86 or ARM cross toolchain. This choice has two results:

- On the QEMU target, every compiler and build tool runs under emulation.
- An output for another architecture is a failure. One x86-64, aarch64 or riscv32 output fails the verification, also when the other outputs are riscv64.

## What are the hard limits?

| Limit | Value | Where to change it |
|---|---|---|
| Fix attempts for each port | 5 | `--max-attempts` |
| Error loop | 3 errors in a row with the same signature | Not configurable |
| LLM cost for each port | $1.00 | Not configurable (`should_escalate` in `src/state.py`) |
| Graph steps for each run | 120 | Not configurable (`recursion_limit` in `main.py`) |
| Time for one build command | 1800 s | Not configurable (default of `execute_command`) |
| Time for the package tests | 600 s | `ATESOR_PACKAGE_TEST_TIMEOUT` |
| Candidate files that the artifact scan reads | 20000 | Not configurable. A scan that stops at this limit gives `unverified`. |
| Time for one LLM request | 120 s | `ATESOR_LLM_TIMEOUT` |
| LLM output tokens | 8192 | `ATESOR_MAX_OUTPUT_TOKENS` |
| Fixer investigation | 1 round of up to 4 read-only commands | Not configurable |
| Few-shot examples for each agent | 100 | Not configurable |
| Memory of the QEMU container | 8 GB | Not configurable (`mem_limit` in `main.py`) |
| Time for performance mode | 3600 s | `ATESOR_OPTIMIZE_BUDGET` |

## What limits apply to the input?

- **Repository URLs.** Atesor accepts only a plain `http` or `https` URL without shell metacharacters. It refuses an SSH URL such as `git@github.com:owner/repo.git`.
- **Private repositories.** Atesor sends `GIT_TOKEN` or `GH_TOKEN` only to URLs that start with `https://github.com/`. It has no token support for other hosts.

## What limits apply to the recipe cache?

- **Old entries are not verified.** Cache entries from before the verification step have no verdict. A cache hit on such an entry prints `NOT VERIFIED` and exits with code 3. The bundled cache has such entries, for example for zlib. Use `--force` to build and verify again.
- **A cache hit does not package.** With `--package`, a cache hit writes no zip file, because no fresh source tree exists. Use `--force`.
- **Only verified ports are learned.** An `unverified` or failed run adds nothing to the recipe cache or to the few-shot examples.
- **Example retrieval uses keywords.** Atesor matches few-shot examples by keywords and regular expressions, not by vector search.

## What limits apply to the LLM layer?

- **Repository content goes to the provider.** The prompts contain excerpts of the build files, the docs and the source code around each error. Use a provider that you trust with that code.
- **Free tiers have caps.** OpenRouter limits free models to a daily request count. When the account reaches the cap, Atesor stops the model rotation and uses its deterministic fallbacks. Easy packages can still build, but the fixer has no fallback.
- **Cost depends on usage reports.** Atesor prices each call from the token usage that the provider reports. A call without usage data counts as 0 tokens. Atesor prices an unknown paid model at a conservative default rate.

## What are the security limits?

- **Untrusted code runs as root in the sandbox.** The cloned code, the commands from the LLM and the harness code of the optimizer agent run as root inside the container. The container is the security boundary.
- **The command whitelist is a guard, not a jail.** `CommandValidator` in `src/tools.py` blocks commands that do not match its patterns. It does not isolate the build.
- **The workspace is shared with the host.** Atesor mounts the host workspace into the container at `/workspace` with read and write access.

## What limits apply to the native target?

- **No CI.** The native target is for local builds and tests only. The CI workflows use the QEMU target.
- **The platform must be explicit.** Set `--platform` or `ATESOR_PLATFORM`. Atesor does not read the distribution from a native container.
- **Clock skew can hide outputs.** The artifact scan counts a file outside the repository, such as `/usr/local/bin/<name>`, only if the file is new. Its time stamp must be later than the run start minus 10 minutes. A large clock difference between your computer and the machine can hide such a file.

## What limits apply to performance mode?

- **It needs a verified port.** For a port that is not verified, performance mode stops with the status `skipped`.
- **Only the native target measures speed.** Under QEMU, each tune gets the correctness gates but no time measurement, and Atesor never accepts a tune.
- **Under QEMU, ISA tunes need a CPU model.** Without `--emulate-cpu` or `ATESOR_QEMU_CPU`, Atesor builds no ISA tune: no `-march`, vector, `GORISCV64` or Rust target tune.
- **It needs a workload.** Without a workload, a native run builds no tune. Atesor does not use benchmark suites that run for a fixed time, such as Google Benchmark or criterion.
- **One workload run must be short.** On native hardware, one run must take 5 seconds or less.
- **The cost cap does not stop the optimizer agent.** Round limits and the time budget limit its LLM calls.
- **A batch run never optimizes.** `batch_test.py` has no option for performance mode.

See [Performance mode](/atesor/docs/guides/optimize/).

## What limits apply to the packages?

- **The `.deb` targets Ubuntu 22.04 and Python 3.10.** For another distribution or Python version, build the package again with a matching base image.
- **The `.deb` has no batch runner.** `batch_test.py` needs a source checkout. See [Batch runs](/atesor/docs/guides/batch-runs/).

## Related pages

- [What is Atesor](/atesor/docs/introduction/what-is-atesor/): the current scope.
- [Troubleshooting](/atesor/docs/guides/troubleshooting/): known failures and what to do.
- [Cost control](/atesor/docs/guides/cost-control/): the cost cap and the price table.
