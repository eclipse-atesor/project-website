---
title: Command-line options
description: Every option of atesor-ai and main.py, with its argument, default and effect, plus the processing order, example commands and the .deb launcher.
sidebar:
  order: 1
---

Eclipse Atesor™ has one command. The `.deb` package installs it as `atesor-ai`, and a source checkout runs it as `python3 main.py`. Both forms take the same options and return the same [exit codes](/atesor/docs/reference/exit-codes/). This page lists every option that `main.py` accepts, with its argument, its default and its effect, and the order in which Atesor processes them.

## What is the command syntax?

The usage text in `main.py` is:

```text
atesor-ai --repo URL [options]
       atesor-ai --setup-only | --cleanup | --clean-workspace
```

A port needs `--repo`. These commands do not need it:

- `--setup-only`
- `--rebuild` without `--repo`
- `--cleanup` and `--clean-image`
- `--clean-workspace`
- `--preflight`
- `--probe`

If you give no `--repo` and none of these commands, Atesor prints `ERROR: --repo argument is required`, prints the help, and exits with code 1.

The built-in help puts the options in four groups: `porting`, `performance`, `sandbox` and `other`. After the options, the help prints example commands and a short list of environment variables. This page groups the options by task.

## Input

| Flag | Argument | Default | Effect |
|---|---|---|---|
| `-r`, `--repo` | `URL` | none | The repository to port. |

Rules for `--repo`:

- The URL must start with `http://` or `https://`.
- After the scheme, the URL can use only letters, digits and the characters `._~:/?#@!+,=%-`.
- Atesor rejects any other value with `ERROR: unsupported or unsafe repository URL` and exit code 1.

Atesor derives the repository name from the last segment of the URL and removes a `.git` suffix. For a generic last segment, Atesor adds the owner in front: `cli`, `core`, `src`, `app`, `main`, `client`, `server` and `lib`. For example, `https://github.com/cli/cli` gives `cli-cli`. The clone directory, the recipe cache key, the log files and the [output files](/atesor/docs/reference/output-files/) all use this name.

## Platform and target

| Flag | Argument | Default | Effect |
|---|---|---|---|
| `--platform` | `NAME` | `auto` | The sandbox distribution: `alpine`, `debian`, `ubuntu` or `auto`. |
| `--target` | `NAME` | `ATESOR_TARGET`, else `qemu` | Where the builds run: `qemu` or `native`. |
| `--container` | `NAME` | the container name of the profile | The sandbox container name. Batch runs use it. |

### `--platform`

- A value other than `auto` sets `ATESOR_PLATFORM` for the run. The flag wins over `.env`.
- `ubuntu` uses the same profile as `debian`. The image, the container and the package names are the same.
- With `auto` on the `qemu` target, Atesor uses a valid `ATESOR_PLATFORM` first.
- Without one, Atesor reads `/etc/os-release` in the sandbox container. The container is `ATESOR_CONTAINER`, else `atesor-ai-sandbox`.
- If that read fails or gives an unknown distribution, Atesor uses `alpine`.
- The `native` target does not detect the platform. Set `--platform` or `ATESOR_PLATFORM`, or preflight rung 1 fails.

| Platform | Image | Container | Dockerfile (`qemu`) | Dockerfile (`native`) |
|---|---|---|---|---|
| `alpine` | `atesor-ai-sandbox:latest` | `atesor-ai-sandbox` | `Dockerfile` | `Dockerfile` |
| `debian`, `ubuntu` | `atesor-ai-sandbox-debian:latest` | `atesor-ai-sandbox-debian` | `Dockerfile.debian` | `Dockerfile.native` |

### `--target`

- `main.py` reads `--target` before it parses the other options, because `src/config.py` computes the workspace paths at import time.
- The flag sets `ATESOR_TARGET` and wins over `.env`. Both `--target native` and `--target=native` work. When you give the flag two times, the last one wins.
- Write the flag in full. The parser also accepts a short form such as `--targ native`, but the early read does not. When the two values differ, Atesor prints `ERROR: write --target in full, for example --target native.` and exits with code 1.
- The `native` target needs the SSH settings. Refer to [Environment variables](/atesor/docs/reference/environment-variables/) and [Native RISC-V machine](/atesor/docs/guides/native-riscv/).

### `--container`

The flag sets `ATESOR_CONTAINER` for the run. `--setup-only`, `--cleanup`, `--clean-image` and the port all use this container name. `batch_test.py` gives each worker its own container with this flag, for example `atesor-ai-sandbox-debian-w1`.

## Run control

| Flag | Argument | Default | Effect |
|---|---|---|---|
| `-m`, `--max-attempts` | `N` (integer) | `5` | The number of attempts before Atesor escalates the run. |
| `--force` | none | off | Ignore the recipe cache and run the full pipeline. |
| `--rebuild` | none | off | Rebuild the sandbox image before the run. |

### `--max-attempts`

Atesor counts each recorded error as one attempt. When the count reaches `N`, the supervisor escalates the run and the exit code is 1. A build that succeeds always goes to the finish step, also when the count is at `N`. A value that is not an integer gives a parser error and exit code 2.

### `--force`

Without `--force`, Atesor looks in the recipe cache before it checks the API key and before it starts the sandbox. A matching entry ends the run: Atesor writes `<repo>_recipe.md` from the cache and makes no LLM call. The entry must match the repository name and the sandbox. When the entry stores a repository URL, that URL must also match. With `--force`, Atesor skips this check and builds again. Refer to [Recipe cache](/atesor/docs/guides/recipe-cache/).

`--optimize` also skips this check, because performance mode needs a real build tree. Without `--force`, a cache entry with a `verified` verdict then becomes the build plan of the port. With `--force`, the agents plan the build again.

### `--rebuild`

The flag sets `REBUILD_IMAGE=true`.

- With `--repo`, Atesor rebuilds the image of the active platform, then ports the repository.
- The cache check comes first. A cache hit ends the run before the rebuild. Add `--force` to rebuild and port. `--optimize` also skips the cache check.
- Without `--repo`, Atesor rebuilds the image and exits.
- On the `qemu` target with `--platform auto` and no `--container`, a rebuild without `--repo` rebuilds the `alpine` sandbox, then the `debian` sandbox.
- On the `native` target, podman builds the image on the machine.

## Output

| Flag | Argument | Default | Effect |
|---|---|---|---|
| `--package` | none | off | After a successful build, write a zip with the recipe and the source tree. |
| `-v`, `--verbose` | none | off | Show the activity of the agents on the console. |

### `--package`

- Atesor writes the zip when the final status is `SUCCESS`. This includes a build that is not verified (exit code 3). The manifest in the zip records the verdict.
- The zip goes to the `packages/` directory of the workspace. Refer to [Output files](/atesor/docs/reference/output-files/).
- With `--optimize`, the manifest has schema version 3. When performance mode accepts a tune, the zip also holds the files of that tune in `optimized/`.
- If the zip step fails, Atesor prints `Packaging FAILED` and exits with code 2.
- On a cache hit, Atesor skips `--package` and prints a note, because no fresh source tree exists. Add `--force` to build and package.

### `--verbose`

Without the flag, the console shows the step and status lines, and log records of level `ERROR` only. With the flag, the console also shows log records of level `DEBUG` and the messages of each agent. The log file always records level `DEBUG`. The lines of the optimize step always show on the console, also without `--verbose`.

## Performance mode

Performance mode tries faster builds of a verified port for the machine that runs the build. Each candidate build is a "tune": the verified build with other compiler flags or toolchain settings. Refer to [Performance mode](/atesor/docs/guides/optimize/).

| Flag | Argument | Default | Effect |
|---|---|---|---|
| `--optimize` | none | off | After a verified port, build, check and measure tunes. |
| `--emulate-cpu` | `MODEL` | `ATESOR_QEMU_CPU`, else none | The `QEMU_CPU` model for `--optimize` and `--probe` on the `qemu` target. |
| `--probe` | none | off | Probe the machine in the sandbox, print the result, then exit. |

### `--optimize`

- The optimize step runs after the finish step, so only a port with the status `SUCCESS` reaches it. A port that fails or escalates does not.
- The step needs the verdict `verified`. For a port that is not verified, Atesor records the status `skipped` and the reason.
- The verified build stays the result of the port. Performance mode never changes the exit code of the port.
- Atesor skips the recipe cache check. Without `--force`, a verified cache entry of the package becomes the build plan. Then the analyst and the scout make no LLM call.
- Atesor applies the patches of that cache entry first. When the build fails, the fixer and the re-plan loop continue as usual.
- Atesor measures speed only on the `native` target. On `qemu`, Atesor builds and checks each tune, but makes no speed claim.
- `ATESOR_OPTIMIZE_BUDGET` sets the time limit of the optimize step, in seconds. The default is 3600.
- The console summary starts with a line `Optimized:` that gives the answer, for example `YES:` or `NO:`.
- On `native`, Atesor removes the `<repo>.opt` tree from the machine when the command ends. Add `--package` to keep the files of an accepted tune.
- `batch_test.py` never passes `--optimize`.

### `--emulate-cpu`

- The value is a QEMU CPU model, for example `rva22u64`. A model can also have properties, for example `rv64i,m=true,a=true,f=true,d=true,c=true,zba=true`.
- The value must start with a letter. It can use only letters, digits and the characters `_.,=+-`, up to 512 characters in total.
- For another value, Atesor prints an `ERROR:` line that says the value is not a QEMU CPU model, and exits with code 1.
- Atesor uses and checks the value only with `--optimize` or `--probe`. Without them, Atesor ignores the flag.
- On `qemu`, the flag wins over `ATESOR_QEMU_CPU`.
- The value `max`, or no value, gives QEMU's `max` CPU. Atesor then builds no ISA tune, because no real board has that set of extensions.
- On `native`, Atesor ignores the flag and prints a warning. It ignores `ATESOR_QEMU_CPU` on `native` with no warning.
- On a native machine, `--probe` prints a `QEMU model:` line. That line gives an `--emulate-cpu` value that models the machine under QEMU.

### `--probe`

- `--probe` runs alone. With `--repo`, Atesor prints `ERROR: --probe runs alone. Remove --repo, or remove --probe to port the repository.` and exits with code 1.
- Atesor does not check the API key for this command.
- Atesor sets up the sandbox first. On `native`, preflight rungs 2 to 11 run before the setup.
- The probe reads `/proc` and `/sys`, runs compiler checks, and runs test instructions in child processes. It does not change the machine.
- Atesor prints the machine facts and the settings that performance mode derives from them. Then it writes `machine_profile_<target>.json` to the `output/` directory, where `<target>` is `qemu` or `native`.
- The exit code is 0 when the probe ran, else 1. On `native`, the container stops when the command ends.
- With `--rebuild`, Atesor rebuilds the sandbox image before the probe.
- Exception: on `qemu` with `--platform auto` and no `--container`, `--probe --rebuild` rebuilds both sandboxes and exits with no probe.

## Setup and cleanup

| Flag | Argument | Default | Effect |
|---|---|---|---|
| `--setup-only` | none | off | Build the sandbox image if it is missing, start the container, then exit. |
| `--cleanup` | none | off | Stop and remove the sandbox container, then exit. |
| `--clean-image` | none | off | Also remove the sandbox image. It implies `--cleanup`. |
| `--clean-workspace` | none | off | Show the workspace size and delete the parts that you select. |

### `--setup-only`

- Atesor does not check the API key for this command.
- `--setup-only` wins over `--repo`. Atesor sets up the sandbox and does not port.
- On `qemu`, Atesor first looks for the `qemu-riscv64` handler in `/proc/sys/fs/binfmt_misc`. If the handler is missing, Atesor runs `docker run --privileged --rm tonistiigi/binfmt --install riscv64` one time.
- On `qemu`, Docker builds the image for `linux/riscv64`. Atesor creates the container with the memory limit `8g` and mounts the workspace at `/workspace`.
- On `native`, preflight rungs 2 to 11 run first. Podman builds the image on the machine, with a time limit of 5400 seconds. The container stops when the command ends.

### `--cleanup` and `--clean-image`

- Atesor uses the container name from `--container` or `ATESOR_CONTAINER`, else the name of the profile.
- With `--repo` and without `--rebuild`, Atesor prints a `NOTE` that it does not port the repository.
- With `--rebuild`, Atesor continues after the teardown.
- On `native`, preflight rungs 2 to 8 run first. Then podman on the machine removes the container, and the image for `--clean-image`.

### `--clean-workspace`

1. Atesor prints the workspace location, the total size and the number of files.
2. Atesor prints the size of each of these directories that exists: `repos`, `output`, `logs`, `.cache` and `patches`.
3. Atesor asks for one choice: `1` (`repos/`), `2` (`output/`), `3` (`logs/`), `4` (`.cache/`), `5` (all five directories) or `q` (quit).
4. Atesor deletes each selected directory and creates it again, empty.

Without an interactive terminal, Atesor cancels the cleanup. On `native`, a choice that includes `repos` also removes the cloned repositories in the work directory on the machine. Preflight rungs 2 to 10 run before that removal. This command always exits with code 0.

## Debugging and help

| Flag | Argument | Default | Effect |
|---|---|---|---|
| `--preflight` | none | off | Check the native machine, then exit. |
| `--version` | none | off | Print `atesor-ai <version>`, then exit. |
| `-h`, `--help` | none | off | Print the help, then exit. |

- `--preflight` runs all 11 preflight rungs and prints each result. The exit code is 0 when all rungs pass, else 1. On the `qemu` target, Atesor prints a message and exits with code 1.
- `--version` prints the value of `__version__` in `src/__init__.py`. The release workflow writes the tag version into that file before it builds the `.deb`.
- `--help` and `--version` exit with code 0.

## In what order does Atesor process the options?

1. Atesor loads the `.env` files and copies `--target` into `ATESOR_TARGET`.
2. `--platform` (other than `auto`) sets `ATESOR_PLATFORM`. `--container` sets `ATESOR_CONTAINER`.
3. Atesor compares `--target` with the early read. Then preflight rung 1 checks the target settings. It runs for every command except `--help` and `--version`, also on `qemu`.
4. With `--optimize` or `--probe`, Atesor checks the `--emulate-cpu` or `ATESOR_QEMU_CPU` value.
5. `--probe` together with `--repo` stops with code 1.
6. `--preflight` runs and exits.
7. Atesor checks the `--repo` URL.
8. `--cleanup` and `--clean-image` run. They exit, unless `--rebuild` is set.
9. `--clean-workspace` runs and exits.
10. Without `--repo`, a setup command or `--probe`, Atesor exits with code 1.
11. A rebuild of both `qemu` sandboxes runs and exits, when it applies.
12. The recipe cache check runs, unless `--setup-only`, `--force` or `--optimize` is set. A hit exits.
13. On `native`, preflight rungs 2 to 11 run.
14. `--probe` sets up the sandbox, probes the machine and exits.
15. Atesor checks the API key of the LLM provider. This step runs only for a port.
16. Atesor sets up the sandbox. `--setup-only`, and `--rebuild` without `--repo`, exit here.
17. The agents port the repository. With `--optimize`, the optimize step follows a successful port.

## Example commands

These examples use only real flags. Replace `atesor-ai` with `python3 main.py` in a source checkout.

```bash
# Build the sandbox one time (the platform comes from auto-detection)
atesor-ai --setup-only

# Port zlib and show the agent activity
atesor-ai --repo https://github.com/madler/zlib --verbose

# Port SQLite in the Debian sandbox and write a zip
atesor-ai --repo https://github.com/sqlite/sqlite --platform debian --package

# Ignore the recipe cache and allow 3 attempts
atesor-ai --repo https://github.com/madler/zlib --force --max-attempts 3

# Check a native riscv64 machine
atesor-ai --target native --platform debian --preflight

# Show what the native machine supports and save the profile
atesor-ai --target native --platform debian --probe

# Port zlib on the native machine, try faster builds, and keep them in a zip
atesor-ai --repo https://github.com/madler/zlib --target native --platform debian --optimize --package

# Build and check the tunes under QEMU with a modelled CPU (no timing)
atesor-ai --repo https://github.com/madler/zlib --optimize --emulate-cpu rva22u64

# Remove the Debian sandbox container and its image
atesor-ai --platform debian --clean-image
```

## How does the `atesor-ai` launcher map to `main.py`?

The `.deb` package installs `/usr/bin/atesor-ai`, a POSIX shell script. The script does these steps:

1. It checks that `/opt/atesor-ai/venv/bin/python3` exists and can run. If not, it prints `atesor-ai: bundled interpreter missing at /opt/atesor-ai/venv/bin/python3.` and a reinstall command, then exits with code 1.
2. It exports `PYTHONDONTWRITEBYTECODE=1`, so Python writes no bytecode files into `/opt`.
3. It puts `/opt/atesor-ai/app` first in `PYTHONPATH`.
4. It runs `exec /opt/atesor-ai/venv/bin/python3 /opt/atesor-ai/app/main.py "$@"`.

The launcher passes all arguments to `main.py` unchanged. Thus `atesor-ai ARGS` and `python3 main.py ARGS` take the same options and return the same exit codes. These items are different:

| Item | Source checkout | `.deb` package |
|---|---|---|
| Command | `python3 main.py` | `atesor-ai` |
| Python | your interpreter and packages | the bundled virtualenv in `/opt/atesor-ai/venv` |
| Application files | the checkout | `/opt/atesor-ai/app` |
| State home | the checkout root | `$XDG_DATA_HOME/atesor-ai`, default `~/.local/share/atesor-ai` |
| First `.env` search | the checkout root and its parents | `/opt/atesor-ai/app` and its parents |

`ATESOR_HOME` changes the state home for both forms. Refer to [Output files](/atesor/docs/reference/output-files/) and [Environment variables](/atesor/docs/reference/environment-variables/).

:::caution
The `.deb` build copies `Dockerfile` and `Dockerfile.debian` into `/opt/atesor-ai/app`, but not `Dockerfile.native`. A native image build for the `debian` or `ubuntu` platform reads `Dockerfile.native`. Use a source checkout for that image build.
:::

The package does not contain `.github/scripts/batch_test.py`. Batch runs need a source checkout. Refer to [Batch runs](/atesor/docs/guides/batch-runs/).
