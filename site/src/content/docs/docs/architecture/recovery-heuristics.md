---
title: Recovery heuristics
description: The 23 LLM-free heuristics in the Atesor builder, 7 rewrites before a command and 16 recovery retries after a failure, with trigger, action and limit.
sidebar:
  order: 4
---

Eclipse Atesor™ repairs many common build failures with fixed rules before it asks the LLM fixer. The builder in `src/graph.py` applies 23 of these LLM-free heuristics: 7 rewrites before a command runs and 16 retries after a command fails. They cost no tokens, and they work when the LLM provider is rate-limited.

## How does the builder use the heuristics?

`builder_node()` runs the phases of the build plan in order. It skips each phase up to `last_successful_phase`, and each command that has a cached success. For each other command, it does these steps:

1. It applies the rewrites 1 to 7 to the command.
2. It runs the rewritten command in the sandbox.
3. If the command fails, it checks the retries 8 to 23 in table order. Each check reads the result of the last retry.
4. When a retry succeeds, the builder goes to the next command.
5. When no retry succeeds, the builder classifies the error, records it, and sets `build_status` to `FAILED`. While attempts remain, the subgraph then sends the run to the LLM fixer.

The count of 23 comes from `builder_node()` on `main`. Other LLM-free recovery steps outside the builder are in the last section.

The Limit column uses these terms:

- **Each run**: the rule applies every time the command runs.
- **Each attempt**: the rule has no memory. It can fire again on each build attempt while its condition is true.
- **Once per command**: `_builder_retry_allowed()` stores a key in `context_cache["builder_retry_keys"]`. The rule fires one time for that key in the whole run.

## Which rewrites run before a command?

These rewrites change the command that runs. They do not change the command in the build plan.

| # | Heuristic | Trigger | Action | Limit |
|---|---|---|---|---|
| 1 | Go VCS flag | `go build` or `go install` without `-buildvcs=false` | Adds `-buildvcs=false` | Each run |
| 2 | Go flag cleanup | `-buildvcs=false` in a Go command that is not `go build` or `go install` | Removes the flag | Each run |
| 3 | gettext rewrite | `autoreconf` in the command, and `m4/gettext.m4` in the repository | Replaces the command with the gettext sequence | Each run |
| 4 | Autotools bootstrap | `./configure` in the command, and no `configure` file at the root | Prepends a bootstrap command (see below) | Each run |
| 5 | Make root redirect | The command starts with `make`, has no ` -C` or ` -f`, and the root has no makefile | Prepends `cd <dir> &&` for the shallowest directory with a makefile | Each run, 2 levels below the root at most |
| 6 | `top_builddir` fix | The command starts with `make`, or a configure phase ends | Adds `top_builddir = <relative path>` to subdirectory Makefiles that use `$(top_builddir)` and do not define it | Each run, 30 second limit |
| 7 | npm script guard | `npm run <script>`, and `package.json` does not declare `<script>` | Runs the first declared script of `build`, `prod`, `compile`, `dist`, or skips the command | Each run |

The gettext sequence is this command:

```bash
cp /usr/share/gettext/m4/*.m4 m4/ 2>/dev/null || true && aclocal -I m4 -I /usr/share/aclocal && autoconf
```

`autoreconf` runs `autopoint`, and `autopoint` reverts a fix to `gettext.m4`. The gettext sequence copies the system macros first and does not run `autopoint`.

The autotools bootstrap (rule 4) picks the first match in this list:

1. `sh autogen.sh`, `sh buildconf`, `sh buildconf.sh` or `sh bootstrap`, for the first script that exists.
2. The gettext sequence, when `configure.ac` or `configure.in` exists and `m4/gettext.m4` exists.
3. `autoreconf -fi`, when `configure.ac` or `configure.in` exists.

If none matches, the command does not change.

The make root redirect (rule 5) skips `.git`, `node_modules`, `vendor`, `testdata`, `test`, `tests`, `examples`, `example`, `third_party`, `contrib` and `__pycache__`. When two directories have the same depth, the first in alphabetical order wins.

The `top_builddir` fix (rule 6) handles old gettext `po/Makefile.in.in` templates. A failure of the fix is only a warning. A lost sandbox connection escalates the run.

## Which retries run after a command fails?

| # | Heuristic | Trigger (in the error output) | Action | Limit |
|---|---|---|---|---|
| 8 | Go VCS retry | A Go build fails with `dubious ownership`, `error obtaining VCS status` or `Use -buildvcs=false` | Retries with `-buildvcs=false` | Each attempt, only without the flag |
| 9 | Go output collision | A Go build fails with `already exists and is a directory` and `build output` | Retries with `-o ./.atesor-bin/<name>` | Each attempt |
| 10 | Go vendoring | A Go build fails with `inconsistent vendoring` | Retries with `-mod=mod` | Each attempt, only without the flag |
| 11 | Go module tidy | A Go build fails with `no required module provides` | Runs `go mod tidy` in the same directory, then retries | Each attempt |
| 12 | autopoint failure | An `autoreconf` command fails with `autopoint` and `no such file` | Runs the gettext sequence | Each attempt |
| 13 | Missing header | `fatal error: <name>.h` or `'<name>.h' file not found` | Installs the matching distro package, then retries | Once per command and package set |
| 14 | CMake with bare make | `no targets specified and no makefile found`, and `CMakeLists.txt` in the command directory | Retries with `cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j1` | Once per command |
| 15 | go.mod in a subdirectory | `go.mod file not found`, and no `go.mod` at the root | Retries with `cd <dir> &&` for the first subdirectory with a `go.mod` | Once per command |
| 16 | CMake compiler cache | A `cmake` command fails with `not a full path to an existing compiler tool` | Removes `build/` and adds explicit compiler paths, or prefixes `CC` and `CXX` | Once per command |
| 17 | Missing Python module | `No module named '<name>'` | Runs `pip install <names>`, then retries | Once per command and module set |
| 18 | Suspected OOM | Exit code 137, or a parallel build that fails with no output | Retries the command single-threaded | Once per command |
| 19 | Go submodules | `no required module provides package`, and a `.gitmodules` file | Runs `git submodule update --init --recursive`, then retries | Once per command |
| 20 | Missing git | `command not found`, and `git` in the command | Installs `git`, then retries | Once per command |
| 21 | Old Go toolchain | A toolchain version error with `go.mod requires go <version>` | Installs that Go version from go.dev, then retries | Once per command |
| 22 | RISC-V relocation | `relocation truncated` and `R_RISCV` | Retries with `CFLAGS='-mcmodel=medany' CXXFLAGS='-mcmodel=medany'` | Once per command |
| 23 | Package not found | `unable to locate package`, `unable to select packages`, `no such package` or `has no installation candidate` | Installs each package alone and keeps the ones that install | Once per command |

When a retry succeeds, some heuristics also put the working command into the build plan. The recipe then shows that command. These are rules 8, 9, 10, 12, 14, 15, 16, 18 and 22, and rule 23 when some packages did not install. The other retries leave the plan command as it is.

### Notes on the retries

**Missing header (13).** The builder maps the header name to a canonical library name, for example `png.h` to `libpng` and `ft2build.h` to `freetype`. It also tries the bare name and `lib<name>`. It installs a package only when the name is in the package map of the active platform profile. It never guesses a package for an unknown or project-local header.

**CMake compiler cache (16).** This failure happens when CMake cached a compiler path that does not exist in the riscv64 image. When the command creates `build/` and the directory exists, the builder removes it in the sandbox. It then adds `-DCMAKE_C_COMPILER=/usr/bin/gcc -DCMAKE_CXX_COMPILER=/usr/bin/g++` to the `cmake` call. Otherwise it prefixes `CC=/usr/bin/gcc CXX=/usr/bin/g++`.

**Missing Python module (17).** Most modules install under their top-level name. A short map handles the exceptions, for example `yaml` to `pyyaml`, `serial` to `pyserial` and `google` to `protobuf`.

**Suspected OOM (18).** OOM means out of memory. Under QEMU emulation, parallel builds and downloads sometimes stop with exit code 137 when no emulated memory remains. The builder treats exit code 137 as OOM for every command. For a parallel command, it also treats a failure with no output as OOM. The parallel commands are `go build`, `go install`, `go test`, `make`, `ninja`, `cargo build`, `cargo install`, `cargo test`, `cargo fetch`, `cargo update`, `pip install`, `npm install`, `npm ci` and `npm run`. The serialized form depends on the tool:

| Tool | Serialized form |
|---|---|
| Go | Adds `-p 1` and `env GOMAXPROCS=1` |
| make | Changes `-j$(nproc)`, `-j<N>` and `--jobs` to `-j1`, and adds `env MAKEFLAGS=-j1` |
| ninja | Adds `-j1` when the command has no `-j` |
| cargo | Adds `-j 1` to `build`, `install` and `test`, and adds `env CARGO_BUILD_JOBS=1` |
| pip | Adds `env MAKEFLAGS=-j1` |
| npm | Adds `--jobs 1` |

The builder keeps a leading `cd <dir> &&` in place. If the serialized form is the same as the original command, the builder does not retry.

**Old Go toolchain (21).** The builder reads the version from the error, and changes a short version such as `1.25` to `1.25.0`. It then runs one command in the sandbox:

1. It downloads `https://go.dev/dl/go<version>.linux-riscv64.tar.gz`.
2. It checks the archive against the SHA-256 from `https://dl.google.com/go/<archive>.sha256`.
3. It unpacks the archive into `/usr/local/.go-staging` and runs the staged `go version`.
4. It moves the new toolchain to `/usr/local/go`. If that move fails, it restores the old toolchain.

The version must match a plain Go version pattern, because the builder puts it in a shell command. Atesor builds this command itself, so it runs outside the LLM command whitelist.

**Package not found (23).** The builder reads the package list from an `apk add` or `apt-get install -y` command. It installs each package with its own command. If at least one package installs, the phase continues. If some packages failed, the plan command changes to install only the good ones. If no package installs, the builder records the failure.

## What other recovery is LLM-free?

These steps are outside `builder_node()`, so they are not in the count of 23:

- **Clone recovery.** A failed clone retries without the GitHub token after an authentication error, then tries URL variants. See [Scripted operations](/atesor/docs/architecture/scripted-ops/).
- **Sandbox health check.** Before a clone, Atesor installs a missing `git`. On Debian and Ubuntu it also removes recent apt source files that break `apt-get update`.
- **Forced re-scout.** `route_supervisor_to_next` sends the run to the scout again for a new plan, one time per run for each of 6 error signatures: `no required module provides`, `already exists and is a directory`, `does not appear to contain cmakelists.txt`, `unable to locate package`, `inconsistent vendoring` and `./configure: no such file or directory`.
- **Fix command rewrite.** The fixer replaces an `autoreconf` command with a gettext sequence when `m4/gettext.m4` exists.
- **Rewind after a fix.** After the fixer changes the tree, `_rewind_after_verify_failure()` makes sure the builder compiles again. When every phase already passed, it rewinds to the first phase with a build step, or to the last phase when no phase has one. It forgets the cached results from there. Earlier phases such as `go mod init` do not run again.
- **Deterministic fallbacks.** The analyst, the scout, the summarizer and the artifact curator each have a fallback for a failed LLM call. See [LLM layer](/atesor/docs/architecture/llm-layer/).
- **Rate-limit retry.** `@agent_node` runs a node again after a rate-limit exception, 3 runs at most. See [Architecture overview](/atesor/docs/architecture/overview/).

To add a heuristic, see [Add a heuristic](/atesor/docs/contributing/add-a-heuristic/).
