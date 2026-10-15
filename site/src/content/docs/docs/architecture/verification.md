---
title: Verification
description: How Atesor proves a riscv64 result from ELF headers, ranks the build outputs, reports "not verified" with exit code 3, and runs package tests.
sidebar:
  order: 5
---

Eclipse Atesor™ does not accept a port because its build commands passed. It reads the ELF header of every build output and accepts the port only when the outputs are real riscv64 machine code. This page describes that check, the artifact ranking, the "not verified" result and the package tests.

## Why is a passed build not enough?

A build can pass and still prove nothing. A header-only library or a script package produces no binary. A build can also produce an x86-64, aarch64 or riscv32 output next to riscv64 ones. Atesor checks the output files themselves, so these cases do not count as a port.

`verify_node` runs after every successful `build_node` in the build-fix subgraph. The scan sets `artifact_verification` in the [agent state](/atesor/docs/architecture/agent-state/). The report, the exit code, the zip manifest and the learning gate read that field.

## What does the artifact scanner read?

ELF (Executable and Linkable Format) is the file format of Linux executables, shared libraries, objects and core dumps. Its header holds the architecture of the code.

`ArtifactScanner.scan()` in `src/artifact_scanner.py` runs one Python program inside the sandbox with `python3 -c`. Every sandbox image has `python3`. The program walks the repository and prints one JSON document, and the host computes the verdict from it. The scan has a 900 second limit and reads at most 20000 candidate files.

The program skips `.git` and `node_modules`. A file is a candidate when all of these conditions are true:

- It is a regular file, not a symbolic link.
- It is 52 bytes or larger.
- It has an execute bit, or its name ends in `.a` or `.so`, or contains `.so.`.

For each candidate, the program reads the ELF header fields `EI_CLASS`, `EI_DATA`, `e_type`, `e_machine` and `e_flags`. Atesor does not parse the text output of `file(1)`.

A file is riscv64 when `e_machine` is 243 (`EM_RISCV`), `EI_CLASS` is 64-bit, and the data is little-endian. A 32-bit RISC-V file is `riscv32`, and a riscv32 output is not a riscv64 port. The scanner names other machines from their `e_machine` value, for example `x86-64`, `aarch64`, `arm`, `ppc64` or `s390x`.

## How does Atesor check static archives?

A static library (`.a` file) is an archive of object files. The program reads the archive member headers and the ELF header of every member. It skips the symbol index members.

- An archive is riscv64 only when every ELF member is riscv64.
- An archive with members of more than one architecture gets the label `mixed(<a>+<b>)`, and it counts as a foreign output.
- A thin archive holds no member data, so it is not evidence.
- The verdict ignores core dumps (`e_type` 4).

## Which outputs are prebuilt?

The program asks git which files are committed, with `git ls-files`, also in submodules. It also asks which committed files the build modified, with `git ls-files -m`. A file that is committed and not modified is prebuilt, for example a vendored blob or a test fixture.

Prebuilt files never decide the verdict. A committed riscv64 binary does not prove the port. A committed x86-64 binary does not fail it. The verdict lists committed foreign binaries in `prebuilt_foreign`, because the build must not link or run them.

## How does Atesor decide the verdict?

`evaluate_scan()` checks these conditions in this order:

| Order | Condition | Status |
|---|---|---|
| 1 | One or more build outputs are not riscv64 | `wrong_arch` |
| 2 | The scan stopped at its file limit | `unverified` |
| 3 | One or more build outputs are riscv64 | `verified` |
| 4 | No ELF build output, or the scan could not run | `unverified` |

One foreign output fails the port, also when all other outputs are riscv64. The `reason` field names up to 5 foreign outputs with their architecture.

A truncated scan cannot prove the port, because an unread output can be foreign. When the scan cannot run, for example when `python3` is missing, the status is `unverified` and `scan_error` holds the cause. A failed scan never gives `verified`.

The verdict also has `abi_warnings`. A warning names each riscv64 output whose ABI is not `lp64d`, the ABI of the Alpine, Debian and Ubuntu riscv64 ports. A warning does not change the status.

After the list holds 3000 entries, the program only counts more riscv64 outputs, in `unlisted_riscv64`. It always lists foreign outputs. The state records at most 60 riscv64 outputs, with expected names first. The verdict keeps the full counts.

## What happens on a wrong-architecture verdict?

`verify_node` sets `build_status` to `FAILED` and adds an `ARCHITECTURE` error: `Artifact verification failed: <reason>`. `route_verify_result` sends this error to `fix_node` while attempts remain. The fixer gets the reason as its error text. After a fix that changes the tree, the builder compiles again from the first phase with a build step, and `verify_node` scans again. The latest scan always replaces the earlier result.

## Where does Atesor search for expected artifacts?

The analyst writes `expected_artifacts` in the `PackageAnalysis`: the binary and library file names that a good build must produce. The scanner uses up to 10 of these names. It drops a name that is not a plain file name.

`make install`, `go install` and `cargo install` can put the outputs outside the repository. The program therefore also searches these directories for the expected names:

- `/usr/local/bin`, `/usr/local/sbin`, `/usr/local/lib`, `/usr/local/lib64`
- `/root/go/bin`, `/root/.cargo/bin`

A file matches when its name is an expected name, or starts with the expected name and a dot. The search goes 3 directory levels below each directory. It ignores a file that is older than the run start minus 600 seconds. An earlier package in a shared sandbox therefore cannot prove this port.

The host uses these matches only when the repository holds no build output at all. Then a riscv64 match gives `verified`, and the reason ends with `(installed outside the repository)`. A foreign match gives `wrong_arch`.

If the result is still `unverified`, `expected_missing` lists the expected names that the search did not find.

## What does "not verified" mean?

An `unverified` verdict is a `SUCCESS` that proves nothing. The build commands passed, but Atesor found no riscv64 output. Common causes are a header-only library, a script-only package, a truncated scan or a scan that could not run.

For an unverified build, Atesor does these things:

- `finish_node` runs and writes the recipe. The summarizer prompt and the fallback recipe include the verification verdict.
- The terminal shows `PORTING FINISHED, NOT VERIFIED` and the reason.
- The report status is `SUCCESS, NOT VERIFIED (no riscv64 output proven)`.
- `main.py` exits with code 3.
- Atesor does not write a recipe cache entry and does not save few-shot examples.

A recipe cache hit also exits with code 3 when its entry has no `verified` verdict. Entries from before the verification feature have no verdict. See [Exit codes](/atesor/docs/reference/exit-codes/) and [Recipe cache](/atesor/docs/guides/recipe-cache/).

`batch_test.py` counts exit code 3 as `UNVERIFIED`, apart from a pass. See [Batch runs](/atesor/docs/guides/batch-runs/).

## How does the curator rank artifacts?

The scanner returns every riscv64 executable and library. That list holds compiler probes, libtool shims and test programs, next to the real deliverables. `src/artifact_curator.py` ranks the list. It runs in `finish_node`, after the recipe, when the state holds build outputs. Atesor stores the result in `curated_artifacts`. The recipe cache entry and the zip manifest use the roles from that list.

The curator gives each output one role:

- **primary**: the headline deliverable, for example the binary with the package name, or the main shared or static library.
- **secondary**: useful outputs that are not the headline, for example tests, examples and tools.
- **drop**: build-system internals and probes.

It does these steps:

1. It removes hard noise first, with no LLM. Hard noise is any path that contains `/CMakeFiles/`, `/_deps/`, `/.libs/`, `/conftest`, `/CompilerId`, `/meson-private/`, `/autom4te.cache/`, `/build-aux/` or a similar marker.
2. It asks the summarizer model to put each numbered path into `primary`, `secondary` or `drop`, with a 60 second limit.
3. An output that the model does not classify becomes `secondary`, so no real deliverable disappears.
4. It puts the primary outputs first.

The curator uses deterministic rules in 4 cases: no model, a failed call, JSON that does not parse, or a response that drops every output. The rules make every library and every binary with the package name primary. A path under `/test/`, `/tests/`, `/examples/`, `/bench/`, `/tools/` or a similar directory is secondary. All other outputs are primary.

## When do package tests run?

`finish_node` runs the package's own test suite one time after a successful build, verified or not. The tests never fail the port. Atesor writes the result to `state.package_tests`, the report, the recipe prompt and the zip manifest, with the label "not gating".

`_detect_test_command()` picks the first row that matches, from the top of this table. It checks `build/`, `_build/` and `builddir/` in that order, and for each directory it checks CTest before Meson.

| Condition | Command |
|---|---|
| The build directory has `CTestTestfile.cmake` | `ctest --test-dir <dir> --output-on-failure` |
| The build directory has `meson-info` | `meson test -C <dir> --print-errorlogs` |
| `go.mod` exists, and the build system is `go` or there is no `Makefile` | `go test ./...` |
| `Cargo.toml` exists, and the build system is `cargo` or `rust` or there is no `Makefile` | `cargo test --release` |
| The top `Makefile` has a `check:` target | `make check` |
| The top `Makefile` has a `test:` target | `make test` |

The test phase has a time limit:

- The default limit is 600 seconds.
- `ATESOR_PACKAGE_TEST_TIMEOUT` sets a different limit. The value `0` disables the phase.
- When `ATESOR_RUN_DEADLINE` (epoch seconds) is set, the limit ends 420 seconds before that time. The summarizer and curator calls, the outputs, the native mirror copy and the zip need that time.
- A limit under 60 seconds skips the phase.

The result `status` is one of these values:

- `passed`: the exit code is 0.
- `failed`: the exit code is not 0.
- `timeout`: the command was killed, with exit code 137 or -1, and it used the time limit minus 35 seconds or more.
- `skipped`: the phase is disabled, has no time left, or found no test suite.
- `error`: the phase could not run.

The result also keeps the framework, the command, the exit code, the duration and the last 3000 characters of output. See [Environment variables](/atesor/docs/reference/environment-variables/).

Performance mode reuses the detected test command. It runs that command again in each tune tree, with the same time limit rules, as its second gate.

## How does performance mode check a tune?

Performance mode (`--optimize`) runs only after a `verified` verdict, and it never changes that verdict or the verified tree. It checks each tune with its own gates:

- The tune must build the libraries of the package and the program that the workload runs. When there is neither, it must build every artifact of the verified build. Every ELF file and static archive of the tune must have `e_machine` 243.
- The package tests must pass in the tune tree when they passed for the verified build.
- The workload output of the tune must equal the output of the baseline.

The gates also scan the code of each tune for instructions from extensions that the machine lacks. A match is a warning, not a failure. See [Performance mode internals](/atesor/docs/architecture/optimize/).

## Related pages

- [Architecture overview](/atesor/docs/architecture/overview/)
- [Output files](/atesor/docs/reference/output-files/)
- [Read the output](/atesor/docs/getting-started/read-the-output/)
- [Performance mode internals](/atesor/docs/architecture/optimize/)
