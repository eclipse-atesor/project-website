---
title: Scripted operations
description: The deterministic layer in src/scripted_ops.py and src/evidence.py that clones, detects the build system, extracts dependencies and scans for arch code.
sidebar:
  order: 3
---

Eclipse Atesor™ does all repository inspection with deterministic Python code before any LLM sees the package. This layer lives in `src/scripted_ops.py` and `src/evidence.py`. It costs no LLM tokens, and it gives the same result for the same repository every time.

## Why does this layer exist?

Every LLM call costs tokens, money and time, and the result can change from one call to the next. Many facts about a repository need no reasoning. File names show the build system, `go.mod` lists the Go modules, and a regular expression finds `#include <immintrin.h>`. The scripted layer collects these facts with no LLM cost.

The facts have three uses:

- `heuristic_plan_node` writes a default build plan from them. For a recognized build system, the run then needs no scout LLM call.
- The analyst, scout and fixer prompts include them, so the model reads real evidence and does not guess file names.
- The deterministic fallbacks use them when an LLM call fails. The analyst fallback and the fallback build plan come from scripted detection.

`init_node` runs this layer through `ScriptedOperations.clone_or_update_repository()` and `quick_analysis()`. It records these operations as `scripted_op` events in the audit trail.

## How does Atesor clone and update a repository?

`clone_or_update_repository(url, name)` works inside the sandbox, so file ownership stays correct. It first rejects a name outside `[A-Za-z0-9_.-]`, a name that starts with a dot, and a URL that is not `http://` or `https://`. Then it does these steps:

1. **Sandbox health check.** It runs `git --version` and installs `git` if it is missing. On Debian and Ubuntu it runs `apt-get update`. If that fails with a `Release file` error, it deletes files in `/etc/apt/sources.list.d` that changed in the last 1440 minutes, then runs `apt-get update` again.
2. **Existing clone.** If the clone exists, it compares the `origin` URL with the requested URL after normalization. A different URL gets a fresh clone.
3. **Reset.** For a matching clone, it runs `git fetch --depth 1 origin && git reset --hard FETCH_HEAD && git clean -fdx`. This removes any file that an earlier run changed. If the reset fails, it makes a fresh clone.
4. **Fresh clone.** It removes the directory and runs `git clone --depth 1`. After an authentication error, it tries again without the token. If the clone still fails, it tries URL variants.
5. **Safe directory.** It runs `git config --global --add safe.directory <path>` for the clone.
6. **Submodules.** If the repository has a `.gitmodules` file, it runs `git submodule update --init --recursive` with a 300 second limit. A failure is only a warning.

The URL variants are, in this order: `/cgit/` changed to `/git/`, the URL with `.git` added, and 4 homepage rules. The homepage rules map `gnu.org/software/<name>` and two GNU Savannah URL forms to `git.savannah.gnu.org/git/<name>.git`, and `dev.yorhel.nl` to `code.blicky.net/yorhel/<name>.git`.

Every git command gets a fail-fast environment: `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=/bin/echo`, and an SSH command with `BatchMode=yes`. A GitHub token is optional. When `GIT_TOKEN` or `GH_TOKEN` is set and the URL starts with `https://github.com/`, Atesor adds a bearer header. It sends the header through `GIT_CONFIG_*` environment variables, only for the git commands of that clone or update. It never writes the token to the git configuration in the sandbox.

## Which build systems does Atesor detect?

`detect_build_system(repo_path)` returns a `BuildSystemInfo` with a type, a confidence from 0 to 1, the primary file and a `module_dir`. It detects 11 build systems from files at the repository root:

| Type | Marker files |
|---|---|
| `cmake` | `CMakeLists.txt` |
| `autotools` | `configure.ac`, `configure.in`, `configure` |
| `make` | `Makefile`, `GNUmakefile` |
| `meson` | `meson.build` |
| `cargo` | `Cargo.toml` |
| `npm` | `package.json`, only with `package-lock.json` or a `build` script |
| `pip` | `setup.py`, `pyproject.toml` |
| `go` | `go.mod` |
| `gradle` | `build.gradle`, `build.gradle.kts` |
| `maven` | `pom.xml` |
| `bazel` | `BUILD`, `BUILD.bazel`, `WORKSPACE` |

The confidence rules are these:

- `CMakeLists.txt`, `Cargo.toml`, `configure.ac` and `go.mod` give 0.95.
- `configure` gives 0.85.
- Each other marker adds 0.3, up to 0.9.
- When both `go` and `npm` match, `npm` gets a lower confidence than `go`.
- The type with the highest confidence wins.

When no marker is at the root, the detector tries these fallbacks in order:

1. A `go.mod` in a subdirectory gives `go` at 0.90. The detector skips vendored and test directories. The detector prefers a directory with `main.go`, a `cmd/` directory or a `package main` file. Else a `Cargo.toml` in a subdirectory gives `cargo` at 0.90.
2. A nested build file, in a directory up to 2 levels below the root, gives 0.75. The detector searches for `CMakeLists.txt`, `meson.build`, `configure.ac`, `configure.in`, `Makefile` and `GNUmakefile`. The shallowest file wins.
3. `.go` files with no `go.mod` (a GOPATH-style project) give `go` at 0.65.
4. If nothing matches, the type is `unknown` with confidence 0.0.

When the primary file is in a subdirectory, `module_dir` holds that directory. The scout prompt shows it. The [build systems reference](/atesor/docs/reference/build-systems/) lists what each build system gets after detection.

For Go, `find_go_main_package()` also finds the main package. It prefers `cmd/<repo name>`, then other `cmd/` directories, then the root. It gives 0 points to directories such as `gen`, `examples`, `test`, `internal`, `tools` and `vendor`. It returns a `build_command` such as `go build ./cmd/<name>`, and it sets `needs_go_init` for a project with no `go.mod`.

## How does Atesor extract dependencies?

`extract_dependencies()` reads the package files of the detected build system. It returns a `DependencyInfo` with `system_packages`, `libraries` and `build_tools`.

| Build system | Source | What it extracts |
|---|---|---|
| `cmake` | `CMakeLists.txt` in `module_dir` | `find_package()` names, plus `pkg_check_modules()` and `pkg_search_module()` modules. 8 CMake names map to distro packages, for example `OpenSSL` to `openssl` and `ZLIB` to `zlib`. |
| `make` | root `Makefile` | `-l<name>` flags. `ssl` and `crypto` map to `openssl`, `z` to `zlib`, and `pthread`, `dl` and `m` to `musl-dev`. |
| `go` | `go.mod` | Module paths from single-line and block `require` statements. |
| `cargo` | `Cargo.toml` | The keys of `[dependencies]`. |
| `pip` | `requirements.txt` | Package names before the version operator. |
| `npm` | `package.json` | `dependencies` and `devDependencies` keys. |

For `cmake` and `make`, the active platform profile resolves each mapped name to the distro package name. There is no extractor for `autotools`, `meson`, `gradle`, `maven` or `bazel`. For those, the analyst LLM is the only source of dependencies.

## What does the architecture scan find?

`find_architecture_specific_code()` walks the repository and returns `ArchSpecificCode` findings. It skips vendored, test, example and documentation directories. It keeps at most 40 findings, and at most 8 in each category. Each finding has a file, a line, a code snippet, a severity and a suggested fix.

| Category | Severity | What matches |
|---|---|---|
| `intrinsic_header` | high | `#include` of an x86 or ARM intrinsic header, for example `immintrin.h`, `cpuid.h` or `arm_neon.h` |
| `inline_asm` | high | `__asm__`, `__asm` or `asm volatile` in a source file |
| `hardcoded_arch_flags` | high | x86 or ARM flags in a build file, for example `-msse4.2`, `-mavx2`, `-m64` or `-march=native` |
| `stale_autotools` | high | A `config.guess` or `config.sub` with a timestamp before 2018-02-22 |
| `arch_dispatch` | high or medium | x86 or ARM macros such as `__x86_64__`, in a file with no `__riscv` or with an `#else` that leads to an `#error`. The `#error` case is `high`. |
| `assembly_source` | medium | A `.S`, `.s` or `.asm` file |
| `go_build_constraints` | medium | A `//go:build` or `// +build` line that holds for linux/amd64 or linux/arm64 but not for linux/riscv64 |
| `go_arch_files` | medium | A directory with `_amd64.go` or `_arm64.go` files and no Go file that builds for linux/riscv64 |

For Go, the scan evaluates the build constraint expressions and the file-name suffix rules. A file such as `x_amd64.go` builds only for amd64. A line such as `//go:build !amd64` is a riscv64 fallback, so it is not a finding.

The findings have these uses. `heuristic_plan_node` sends the run to the LLM scout when there is a `critical` finding or 3 or more `high` findings. The scout prompt lists up to 10 findings. The fixer prompt and the escalation report list up to 5 `high` or `critical` findings.

`detect_arch_specific_build_files()` is a second, smaller check. It searches the content of `*.mak` and `*.mk` files for per-architecture names, such as `makefile.x86_64` or `build_arm64`. It reports whether a RISC-V variant already exists.

## What does Atesor probe in the sandbox?

`get_system_info(tools)` runs `which <tool>` inside the sandbox for each tool and `uname -m` for the architecture. Each tool is `Available in PATH` or `Not installed`.

- `init_node` probes `gcc`, `make`, the detected build-system type and the build tools from the dependencies. It stores the result in `context_cache["system_info"]` and the missing tools in `context_cache["missing_tools"]`.
- `scout_node` probes the default list and puts it in its prompt. The default list is `gcc`, `g++`, `cmake`, `make`, `ninja`, `meson`, `automake`, `autoconf`, `python3`, `go`, `rustc` and `cargo`.

`quick_analysis()` also collects the commit and branch, a compact repository tree, and up to 10 documentation files. `init_node` reads the first 5 documentation files, up to 500 lines each, into `file_content_cache`.

On the native target, the build tree is on the remote machine. The scripted layer refreshes a local mirror of that repository and reads the mirror. See [Native RISC-V](/atesor/docs/guides/native-riscv/).

## What is in an evidence bundle?

`src/evidence.py` puts real file content into prompts. It has two functions, and both have size limits.

`collect_build_evidence(repo_path)` builds the evidence for the analyst and the scout:

1. A listing of the top-level entries, up to 60.
2. Excerpts of the build files that exist, in this order: `go.mod`, `Cargo.toml`, `CMakeLists.txt`, `configure.ac`, `configure.in`, `meson.build`, `Makefile.am`, `Makefile`, `makefile`, `GNUmakefile`, `pyproject.toml`, `setup.py`, `package.json`. Each excerpt has at most 2500 characters.
3. One documentation excerpt of at most 2000 characters, from the first file found: `README.md`, `README.rst`, `README`, `README.txt`, `INSTALL`, `INSTALL.md`, `BUILDING.md`, `BUILD.md` or `docs/BUILD.md`.

The total bundle has at most 14000 characters.

`error_context_excerpts(error_text, repo_path)` builds the evidence for the fixer. It finds `file:line` references in the error text, for files with source or build extensions such as `.c`, `.go`, `.rs`, `.m4` or `.cmake`. For up to 3 files inside the repository, it shows 12 lines before and after the referenced line, with line numbers. It ignores absolute paths and paths with `..`.

## Related pages

- [Architecture overview](/atesor/docs/architecture/overview/)
- [Recovery heuristics](/atesor/docs/architecture/recovery-heuristics/)
- [LLM layer](/atesor/docs/architecture/llm-layer/)
- [Build systems](/atesor/docs/reference/build-systems/)
