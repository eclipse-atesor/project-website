---
title: Build systems
description: The build systems that Atesor detects, the marker files it looks for, the default build and test commands, and the support level of each one.
sidebar:
  order: 5
---

Eclipse Atesor™ finds the build system of a repository from marker files, with no LLM call. The build system selects the default build plan, the dependency scan, the package test command and the tunes of performance mode. This page lists each build system that the code detects, how Atesor detects it, the default commands, and the support level.

## What is the support level of each build system?

| Build system | Ecosystem | Support level |
|---|---|---|
| `cmake` | C, C++ | Full |
| `make` | C, C++ | Full |
| `autotools` | C, C++ | Full |
| `go` | Go modules, and GOPATH-style Go | Full |
| `meson` | C, C++ | Fallback |
| `cargo` | Rust | Fallback |
| `npm` | Node.js | Guarded |
| `pip` | Python | Detected only |
| `gradle` | JVM | Detected only |
| `maven` | JVM | Detected only |
| `bazel` | multi-language | Detected only |

The levels mean this:

- **Full**: Atesor has a default build plan that needs no LLM call. It also has a fallback plan and a package test command.
- **Fallback**: The LLM scout writes the build plan. If the scout fails, Atesor uses a built-in fallback plan. Atesor finds the package test command.
- **Guarded**: The LLM scout writes the build plan. Detection and the builder have extra checks for this ecosystem. If the scout fails, Atesor uses the discovery plan.
- **Detected only**: Atesor detects the build system and tells the LLM scout. The scout writes the plan. If the scout fails, Atesor uses the discovery plan.

All levels share the same sandbox, the same build and fix loop, and the same artifact verification. Refer to [How it works](/atesor/docs/introduction/how-it-works/).

## How does Atesor detect the build system?

`ScriptedOperations.detect_build_system()` in `src/scripted_ops.py` looks for these files in the repository root, in this order:

| Build system | Marker files |
|---|---|
| `cmake` | `CMakeLists.txt` |
| `autotools` | `configure.ac`, `configure.in`, `configure` |
| `make` | `Makefile`, `GNUmakefile` |
| `meson` | `meson.build` |
| `cargo` | `Cargo.toml` |
| `npm` | `package.json` |
| `pip` | `setup.py`, `pyproject.toml` |
| `go` | `go.mod` |
| `gradle` | `build.gradle`, `build.gradle.kts` |
| `maven` | `pom.xml` |
| `bazel` | `BUILD`, `BUILD.bazel`, `WORKSPACE` |

Each marker gives a confidence value:

- `CMakeLists.txt`, `Cargo.toml`, `configure.ac` and `go.mod` give 0.95.
- `configure` gives 0.85, but never lowers a value that is already higher.
- Each other marker adds 0.3 to its build system, up to 0.9.

Rules for the result:

- The build system with the highest confidence wins. On a tie, the build system that comes first in the table wins.
- `package.json` counts only when the root also has `package-lock.json`, or `package.json` declares a `build` script.
- When Atesor finds both `go` and `npm`, `go` wins.
- When the primary marker file is in a subdirectory, Atesor records that directory as `module_dir`. The scout and the builder use it.

### What if the root has no marker file?

Atesor tries these steps in order, and stops at the first match:

1. Atesor searches all subdirectories for `go.mod` and `Cargo.toml`. It skips vendored and test directories such as `vendor`, `third_party`, `node_modules`, `test`, `tests`, `examples` and `docs`. A Go module wins over a Cargo module. Confidence: 0.90.
2. Atesor searches the directories 1 and 2 levels below the root for `CMakeLists.txt`, `meson.build`, `configure.ac`, `configure.in`, `Makefile` and `GNUmakefile`. It skips the same vendored and test directories. The shallowest file wins, then the first file in this list. Confidence: 0.75.
3. Atesor looks for `.go` files without a `go.mod`. A match gives `go` (GOPATH style), and the plan adds `go mod init`. Confidence: 0.65.
4. No match gives `unknown`, with confidence 0.0.

For a Go module in a subdirectory, Atesor prefers the directory with the strongest signs of a program: a `main.go` file, a `cmd/` directory, and a `.go` file with `package main`.

## When does Atesor use the default plan?

After detection, the analyst agent reads the build files with an LLM. Then `heuristic_plan_node()` in `src/graph.py` decides between the default plan and the LLM scout. Atesor uses the default plan only when all of these conditions are true:

- The build system is `cmake`, `make`, `autotools` or `go`.
- The confidence is 0.5 or more.
- The analyst did not set `needs_custom_plan`.
- The scan found no `critical` arch-specific code, and fewer than 3 `high` findings.

The analyst can replace the detected build system and confidence with its own. This happens when the analyst read the files with an LLM, names a build system other than `unknown`, and has a confidence equal to or higher than the detection confidence. In all other cases, the LLM scout writes the plan.

:::note
A root `Makefile` alone gives a confidence of 0.3, which is below 0.5. The default `make` plan then needs the analyst to confirm `make` with a higher confidence.
:::

With `--optimize`, a verified entry in the recipe cache replaces this decision. The cached build plan becomes the plan, with confidence 1.0. The analyst, the default plan and the scout do not run before the first build. When the entry has no command, Atesor plans as usual. `--force` turns this off. Refer to [Command-line options](/atesor/docs/reference/cli/).

## What are the default build commands?

Each plan starts with a `setup` phase. It runs one install command for the active sandbox: `<update> && <install> <packages>`. The packages come from canonical names that the platform profile maps to distribution packages. The default plan also adds the dependencies that the analyst and the scan found, when the profile knows them. The setup command has up to 15 names in total. The fallback plans install only the packages in their table.

### Default plans (no LLM)

| Build system | Setup packages (canonical) | Configure | Build |
|---|---|---|---|
| `cmake` | `cmake`, `gcc` | `mkdir -p build && cd build && cmake .. -DCMAKE_BUILD_TYPE=Release` | `cd build && make -j$(nproc)` |
| `make` | `gcc` | none | `make -j$(nproc)` |
| `autotools` | `gcc`, `autotools`, `pkgconfig` | `./configure` | `make -j$(nproc)` |
| `go` | `git` | none | `go mod tidy`, then the Go build command |

The Go build command comes from the search for the `main` package:

- `go build -buildvcs=false ./<dir>` for a `main` package in a subdirectory of the module. Atesor prefers `cmd/<repository name>`, then the other `cmd/` directories, then the module root.
- `go build -buildvcs=false .` for a `main` package in the module root, for a GOPATH-style repository, and when the search finds no `main` package.
- `go build -buildvcs=false ./...` when Atesor has no search result, for example when the analyst changes the build system to `go`.
- For a repository without `go.mod`, the phase starts with `go mod init <module>` and `go mod tidy`. `<module>` is the repository URL without `https://`.

### Fallback plans (after a scout failure)

When the LLM scout gives no valid plan, `create_fallback_build_plan()` in `src/graph.py` uses the detected build system:

| Build system | Setup packages (canonical) | Configure | Build |
|---|---|---|---|
| `cmake` | `gcc`, `cmake` | `mkdir -p build`, then `cd build && cmake .. -DCMAKE_BUILD_TYPE=Release` | `cd build && make -j$(nproc)` |
| `make` | `gcc` | none | `make -j$(nproc)` |
| `autotools` | `gcc`, `autotools`, `pkgconfig` | `./configure` | `make -j$(nproc)` |
| `go` | `git` | none | `go mod tidy` (and `go mod init` when needed), then the Go build command |
| `meson` | `gcc`, `meson`, `ninja` | `meson setup builddir` | `ninja -C builddir` |
| `cargo` | `rust` | none | `cargo build --release` |
| other | none | none | `make -j$(nproc)` |

- For `autotools` without a committed `configure`, the configure phase runs `autoreconf -fi` before `./configure`.
- The `autotools` setup phase also copies the gettext `.m4` files into `m4/`.
- In the `go` fallback plan, `go build .` becomes `go build -buildvcs=false ./...`. Another Go build command stays as the search gave it. The sandbox images set `GOFLAGS=-buildvcs=false`.
- For other build systems, a `discover` phase runs `ls -la` on the build files that exist, or a short `find` for them. Then the plan runs `make -j$(nproc)`.

:::note
Neither platform profile maps the canonical name `rust`, so the `cargo` fallback plan passes `rust` to the package manager unchanged. The sandbox images already contain a Rust toolchain from rustup.
:::

## Which package test command does Atesor run?

After a successful build, Atesor runs the tests of the package one time. The result goes into the report and the zip manifest. It never changes the result of the port. `_detect_test_command()` in `src/graph.py` checks these cases in order:

1. In `build/`, `_build/` or `builddir/`: a `CTestTestfile.cmake` file gives `ctest --test-dir <dir> --output-on-failure`.
2. In the same directories: a `meson-info` directory gives `meson test -C <dir> --print-errorlogs`.
3. A root `go.mod` gives `go test ./...`, when the plan is `go` or the root has no `Makefile`.
4. A root `Cargo.toml` gives `cargo test --release`, when the plan is `cargo` or `rust`, or the root has no `Makefile`.
5. A root `Makefile` with a `check:` target gives `make check`. Else a `test:` target gives `make test`.

Without a match, the result is `skipped`. The time limit is 600 seconds. Refer to [Environment variables](/atesor/docs/reference/environment-variables/) for `ATESOR_PACKAGE_TEST_TIMEOUT`.

A build plan from the LLM scout never runs tests. Atesor removes these commands from the scout plan, because the package tests run after the build:

- `ctest`, `pytest` and `python -m pytest`.
- `go test`, `cargo test`, `meson test` and `npm test`.
- `make`, `gmake` or `ninja` with the target `check`, `test` or `tests`.
- `cmake --build` with `--target check`, `--target test` or `--target tests`.

Atesor ignores a leading `cd <dir> &&` and leading `NAME=value` words when it reads a command. A phase that has no command left goes out of the plan. A scout plan with only test commands counts as a scout failure, so Atesor uses the fallback plan.

## What else does Atesor do for each build system?

The scan reads the dependencies of some build systems from their files, with no LLM call:

| Build system | Dependency scan |
|---|---|
| `cmake` | `find_package()`, `pkg_check_modules()` and `pkg_search_module()` in `CMakeLists.txt` |
| `make` | `-l<name>` flags in `Makefile` |
| `go` | `require` lines in `go.mod` |
| `cargo` | `[dependencies]` in `Cargo.toml` |
| `npm` | `dependencies` and `devDependencies` in `package.json` |
| `pip` | `requirements.txt` |
| `autotools`, `meson`, `gradle`, `maven`, `bazel` | none |

The builder also changes or retries some commands with no LLM call. This table shows examples for each build system. Refer to [Recovery heuristics](/atesor/docs/architecture/recovery-heuristics/) for the full list.

| Build system | Examples of builder adjustments |
|---|---|
| `cmake` | When a bare `make` finds no makefile next to `CMakeLists.txt`, Atesor retries with `cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j1`. When the CMake cache has a stale compiler path, Atesor deletes `build/` and sets `/usr/bin/gcc` and `/usr/bin/g++`. |
| `make` | When the root has no makefile, a plain `make` runs in the shallowest subdirectory that has one, 1 or 2 levels below the root. |
| `autotools` | When the repository has no committed `configure`, Atesor runs a bootstrap before `./configure`. |
| `go` | Atesor adds `-buildvcs=false` to `go build` and `go install`, and removes it from other Go commands. It retries with `-mod=mod` or after `go mod tidy` for some module errors. |
| `meson` | `ninja` runs with `-j1` after a suspected out-of-memory kill. |
| `cargo` | `cargo` runs with `-j 1` and `CARGO_BUILD_JOBS=1` after a suspected out-of-memory kill. |
| `npm` | The `npm run <script>` guard. `npm install`, `npm ci` and `npm run` get `--jobs 1` after a suspected out-of-memory kill. |
| `pip` | `pip install` runs with `MAKEFLAGS=-j1` after a suspected out-of-memory kill. |

The autotools bootstrap uses the first case that applies:

1. The repository has `autogen.sh`, `buildconf`, `buildconf.sh` or `bootstrap`. Atesor runs `sh <script>`.
2. The repository has `configure.ac` or `configure.in`, and `m4/gettext.m4`. Atesor copies the gettext `.m4` files into `m4/`, then runs `aclocal -I m4 -I /usr/share/aclocal && autoconf`.
3. The repository has `configure.ac` or `configure.in`. Atesor runs `autoreconf -fi`.

The `npm run <script>` guard works like this:

- When `package.json` does not declare the script, Atesor uses the first declared script of `build`, `prod`, `compile` and `dist`.
- When none of them exists, Atesor skips the command.

After a suspected out-of-memory kill, Atesor also runs `make` with `-j1` and `MAKEFLAGS=-j1`, and Go with `-p 1` and `GOMAXPROCS=1`. Exit code 137 always counts as an out-of-memory kill.

Performance mode (`--optimize`) also reads the build system of the plan. It treats `go` as Go, `cargo` and `rust` as Rust, and every other build system as C or C++. The language selects the tunes:

- C and C++: core tuning (`-mtune`), machine ISA (`-march`), vector ISA, optimization level, link-time optimization and a second compiler, all through wrapper scripts. Then profile-guided optimization on top of the best tune.
- Go: the `GORISCV64` level, then profile-guided optimization.
- Rust: `RUSTFLAGS` with a target CPU or target features, then link-time optimization.

A tune repeats the commands of the verified build in a copy of the tree. It does not repeat package installs, install steps, source control steps and writes outside the tree. Refer to [Performance mode](/atesor/docs/guides/optimize/).

## Which tool packages does each sandbox install?

The platform profiles in `src/platforms.py` map canonical names to distribution packages:

| Canonical name | Alpine | Debian and Ubuntu |
|---|---|---|
| `cmake` | `cmake` | `cmake` |
| `make` | `make` | `make` |
| `ninja` | `ninja` | `ninja-build` |
| `meson` | `meson` | `meson` |
| `autotools` | `automake autoconf libtool` | `autoconf automake libtool` |
| `gcc`, `g++` | `build-base` | `build-essential` |
| `pkgconfig` | `pkgconf` | `pkg-config` |
| `python3` | `python3 py3-pip` | `python3 python3-pip python3-dev` |
| `node` | `nodejs npm` | `nodejs npm` |
| `java` | `openjdk17` | `openjdk-17-jdk` |
| `git` | `git` | `git` |
| `go` | `go` | no entry |
| `rust` | no entry | no entry |

All three sandbox images contain Go 1.26.5 in `/usr/local/go` and Rust 1.99.0 from rustup in `/root/.cargo`. The profiles have no `rust` entry and the Debian profile has no `go` entry, so that a distribution package does not hide the newer toolchain. `Dockerfile.native` also installs `clang-19`, `lld-19`, `llvm-19` and `libclang-rt-19-dev` for the second compiler and the clang profiles of performance mode. Refer to [Sandboxes](/atesor/docs/guides/sandboxes/) and [Add a platform](/atesor/docs/contributing/add-a-platform/).
