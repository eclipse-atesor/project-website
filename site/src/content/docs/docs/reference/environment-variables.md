---
title: Environment variables
description: Every environment variable that Atesor reads, with its default, what it controls and the file that reads it, plus the .env load order.
sidebar:
  order: 2
---

Eclipse Atesor™ reads its settings from environment variables and from `.env` files. This page lists every variable that the code reads, with its default, what it controls, and the file that reads it. Some command-line flags set a variable for one run. Refer to [Command-line options](/atesor/docs/reference/cli/).

## How does Atesor load `.env` files?

`main.py` loads the `.env` files at start-up, before it imports the other modules. It loads them in this order:

1. The first `.env` that python-dotenv finds. A call to `load_dotenv()` with no path starts the search in the directory of `main.py`, then goes up through each parent directory. It does not start in the current directory.
2. `$ATESOR_HOME/.env`, when `ATESOR_HOME` has a value. A value from step 1 also counts.
3. `$XDG_CONFIG_HOME/atesor-ai/.env`. The default is `~/.config/atesor-ai/.env`.
4. `$XDG_DATA_HOME/atesor-ai/.env`. The default is `~/.local/share/atesor-ai/.env`.

No file replaces a variable that already has a value. Thus a variable in the process environment wins over all files, and an earlier file wins over a later file.

:::note
For the `.deb` package, step 1 searches `/opt/atesor-ai/app` and its parent directories, not your current directory. Put your `.env` in `~/.config/atesor-ai/`, or set the variables in the environment. The package installs the template at `/opt/atesor-ai/app/.env-example`.
:::

## LLM provider and keys

| Variable | Default | What it controls | Read in |
|---|---|---|---|
| `LLM_PROVIDER` | `gemini` | The LLM provider: `gemini`, `openai`, `openrouter` or `anthropic`. Case does not matter. | `src/models.py` |
| `GOOGLE_API_KEY` | none | The API key for `gemini`. | `src/models.py`, Google SDK |
| `OPENAI_API_KEY` | none | The API key for `openai`. | `src/models.py`, OpenAI SDK |
| `OPENROUTER_API_KEY` | none | The API key for `openrouter`. Atesor sends it to `https://openrouter.ai/api/v1`. | `src/models.py` |
| `ANTHROPIC_API_KEY` | none | The API key for `anthropic`. | `src/models.py`, Anthropic SDK |
| `GIT_TOKEN` | none | A token to clone private GitHub repositories. | `src/scripted_ops.py` |
| `GH_TOKEN` | none | The same as `GIT_TOKEN`. Atesor uses it when `GIT_TOKEN` is empty. | `src/scripted_ops.py` |

- Only the key of the selected provider is necessary.
- The placeholder value `your_key_here` counts as a missing key.
- Atesor checks the key only for a port, after the recipe cache check. A missing key, or a provider name that Atesor does not know, gives exit code 1.
- The `anthropic` provider also needs the Python package `langchain-anthropic`. Without it, the key check fails with exit code 1. `requirements.txt` lists the package.
- Atesor sends the git token only to `https://github.com/` URLs. It adds the header `Authorization: bearer <token>` to each clone through `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_0` and `GIT_CONFIG_VALUE_0`. It does not write the token to the git configuration of the sandbox.

Refer to [Configure the LLM](/atesor/docs/getting-started/configure-llm/).

## Models and LLM calls

| Variable | Default | What it controls | Read in |
|---|---|---|---|
| `OPENROUTER_FALLBACK_MODELS` | six free models, listed below | The fallback model IDs for `openrouter`, separated by commas, in order. | `src/models.py` |
| `ATESOR_MAX_OUTPUT_TOKENS` | `8192` | The output-token limit of each LLM call. For `anthropic`, the limit also covers the thinking tokens of the reply. | `src/models.py` |
| `ATESOR_LLM_TIMEOUT` | `120` | The HTTP timeout of each LLM request, in seconds. | `src/models.py` |

The default fallback list is:

```text
qwen/qwen3-coder:free
openai/gpt-oss-120b:free
openai/gpt-oss-20b:free
meta-llama/llama-3.3-70b-instruct:free
qwen/qwen3-next-80b-a3b-instruct:free
nvidia/nemotron-3-super-120b-a12b:free
```

- Atesor always adds `openrouter/free` at the end of the fallback list.
- Each OpenRouter request also sends a `models` array: the first two fallbacks that are not the primary model, then `openrouter/free`.
- `src/graph.py` and `src/llm_helpers.py` stop the wait for one LLM call after `ATESOR_LLM_TIMEOUT` plus 15 seconds.
- Exception: when the optimizer agent of `--optimize` writes code, the wait is 240 seconds. `ATESOR_LLM_TIMEOUT` does not change this value.
- `ATESOR_MAX_OUTPUT_TOKENS` and `ATESOR_LLM_TIMEOUT` must be integers. `src/models.py` reads them at import time, so another value stops Atesor at start-up with a Python error.

No environment variable selects the model of an agent role. The models, temperatures and, for `anthropic`, the effort levels come from `MODEL_CONFIG` in `src/models.py`. Refer to [LLM layer](/atesor/docs/architecture/llm-layer/).

## Cost

No environment variable sets the cost limit. `should_escalate()` in `src/state.py` escalates a run when its LLM cost is more than 1.0 USD. Atesor calculates the cost of each call from its token usage. Free models cost 0. Refer to [Cost control](/atesor/docs/guides/cost-control/).

Only the supervisor checks this limit, during the port. The limit does not stop the LLM calls of the optimize step. The cost of those calls still goes into the run total of the report.

## Target and native machine

| Variable | Default | What it controls | Read in |
|---|---|---|---|
| `ATESOR_TARGET` | `qemu` | Where the builds run: `qemu` or `native`. `--target` sets it. | `src/target.py`, `src/config.py` |
| `ATESOR_PLATFORM` | none (detection) | The sandbox distribution: `alpine`, `debian` or `ubuntu`. `--platform` sets it. | `src/platforms.py`, `src/target.py` |
| `ATESOR_CONTAINER` | the container name of the profile | The sandbox container name. `--container` sets it. | `src/platforms.py` |
| `REBUILD_IMAGE` | none | The value `true` forces a rebuild of the sandbox image. `--rebuild` sets it. | `main.py` |
| `ATESOR_SSH_HOST` | none | Alias mode: the ssh destination, as you type it after `ssh`. | `src/target.py` |
| `ATESOR_SSH_HOSTNAME` | none | Field mode: the address of the machine. | `src/target.py` |
| `ATESOR_SSH_PORT` | `22` | Field mode: the SSH port, from 1 to 65535. | `src/target.py` |
| `ATESOR_SSH_USER` | the ssh default | Field mode: the login user. | `src/target.py` |
| `ATESOR_SSH_IDENTITY_FILE` | none | Field mode: the path to the private key file. | `src/target.py` |
| `ATESOR_REMOTE_WORKDIR` | `~/atesor-ai` | The work directory on the machine. | `src/target.py` |

Rules for these variables:

- A value of `ATESOR_TARGET` other than `qemu` or `native` makes preflight rung 1 fail. An empty value means `qemu`.
- On `qemu`, Atesor ignores an unknown `ATESOR_PLATFORM` value and writes a warning to the log.
- On `native`, `ATESOR_PLATFORM` is necessary. Rung 1 fails without it.
- Atesor reads the `ATESOR_SSH_*` keys and `ATESOR_REMOTE_WORKDIR` only on the `native` target.
- Set alias mode (`ATESOR_SSH_HOST`) or field mode (`ATESOR_SSH_HOSTNAME` and the other field keys), not both.
- Field mode needs `ATESOR_SSH_HOSTNAME`.
- Any other `ATESOR_SSH_*` key with a value makes rung 1 fail. Atesor supports key login only.
- `ATESOR_SSH_HOST` must be one destination with no spaces and no leading `-`.
- `ATESOR_SSH_IDENTITY_FILE` must have no spaces, no quotes and no `%`.
- `ATESOR_REMOTE_WORKDIR` can use only letters, digits and the characters `.`, `_`, `/`, `~` and `-`.

In field mode, Atesor writes the SSH settings to `ssh_config` in the cache directory, with mode `0600`. Refer to [Native RISC-V machine](/atesor/docs/guides/native-riscv/).

## Paths

| Variable | Default | What it controls | Read in |
|---|---|---|---|
| `ATESOR_HOME` | none | The state home: the base directory for all runtime state. It also adds `$ATESOR_HOME/.env` to the `.env` search. | `src/config.py`, `main.py` |
| `XDG_DATA_HOME` | `~/.local/share` | The parent of the default state home `atesor-ai/`, and of one `.env` location. | `src/config.py`, `main.py` |
| `XDG_CONFIG_HOME` | `~/.config` | The parent of the `atesor-ai/.env` location. | `main.py` |
| `XDG_CACHE_HOME` | `~/.cache` | The parent of `atesor-ai/`, which holds the native `ssh_config`. | `src/target.py` |
| `XDG_RUNTIME_DIR` | none | When this directory exists, `atesor-ai/` in it holds the ssh control sockets. Else the cache directory holds them. | `src/target.py` |

`src/config.py` selects the state home in this order:

1. `$ATESOR_HOME`, when it has a value.
2. `/workspace`, when Atesor itself runs in a container.
3. The source checkout root, when it has `.git` or `tests/` and you can write to it.
4. `$XDG_DATA_HOME/atesor-ai`. The default is `~/.local/share/atesor-ai`.

Refer to [Output files](/atesor/docs/reference/output-files/) for the directories under the state home.

## Package tests and run time

| Variable | Default | What it controls | Read in |
|---|---|---|---|
| `ATESOR_PACKAGE_TEST_TIMEOUT` | `600` | The time limit of the package tests, in seconds. | `src/graph.py` |
| `ATESOR_RUN_DEADLINE` | none | The kill time of the run, in epoch seconds. | `src/graph.py` |

- A limit under 60 seconds skips the package tests. Thus `ATESOR_PACKAGE_TEST_TIMEOUT=0` turns them off.
- A value of `ATESOR_PACKAGE_TEST_TIMEOUT` that is not an integer gives 600.
- With `ATESOR_RUN_DEADLINE`, the tests must end 420 seconds before that time. `batch_test.py` sets it for each child run.
- When the port ran a test command, performance mode runs the same command in each tune tree, with the same time limit.

## Performance mode

`ATESOR_OPTIMIZE_BUDGET` applies to `--optimize`. `ATESOR_QEMU_CPU` applies to `--optimize` and `--probe`. Refer to [Performance mode](/atesor/docs/guides/optimize/).

| Variable | Default | What it controls | Read in |
|---|---|---|---|
| `ATESOR_OPTIMIZE_BUDGET` | `3600` | The time limit of the optimize step, in seconds. | `src/optimize.py` |
| `ATESOR_QEMU_CPU` | none | The `QEMU_CPU` model for `--optimize` and `--probe` on the `qemu` target. `--emulate-cpu` wins over it. | `main.py` |

Rules for `ATESOR_OPTIMIZE_BUDGET`:

- The time counts from the start of the optimize step, not from the start of the port.
- Atesor checks the remaining time before each step. Each tune build gets the remaining time, with a minimum of 60 seconds and a maximum of 1800 seconds.
- A value that is not a number gives 3600.
- One step needs at least 300 seconds. With less time left, Atesor skips the step. A budget under 300 seconds stops before the baseline build, with the status `not measured`.
- When the budget ends before the second check of a faster tune, the result is `not confirmed`. The report then advises a larger `ATESOR_OPTIMIZE_BUDGET`.

Rules for `ATESOR_QEMU_CPU`:

- Atesor reads it only with `--optimize` or `--probe`, and only on the `qemu` target. On `native`, Atesor ignores it.
- The value follows the rules of `--emulate-cpu`. Another value gives exit code 1.
- The value `max`, or no value, gives QEMU's `max` CPU. Atesor then builds no ISA tune.

## Logging and tracing

No Atesor variable sets the log level. Use `--verbose` for the console. The log file always records level `DEBUG`.

| Variable | Default | What it controls | Read in |
|---|---|---|---|
| `LANGCHAIN_TRACING_V2` | none | LangSmith tracing. | LangChain SDK, not Atesor code |
| `LANGCHAIN_API_KEY` | none | The LangSmith API key. | LangChain SDK, not Atesor code |

## CI only

These rows describe how the scripts in `.github/scripts/` read a variable. The `ATESOR_PLATFORM` row gives the default of `batch_test.py` only. `main.py` reads that variable as the [Target and native machine](/atesor/docs/reference/environment-variables/#target-and-native-machine) table says.

| Variable | Default | What it controls | Read in |
|---|---|---|---|
| `ATESOR_PLATFORM` | `debian` | The default platform of a batch run. | `.github/scripts/batch_test.py` |
| `ATESOR_SETUP_STREAM` | off | `1`, `true`, `yes` or `on` shows the live output of each worker sandbox setup. | `.github/scripts/batch_test.py` |
| `NO_COLOR` | none | When it is set, the batch output has no color. | `.github/scripts/batch_test.py` |
| `ATESOR_HEALTHCHECK_TIMEOUT` | `30` | The HTTP timeout of each provider probe, in seconds. | `.github/scripts/check_llm_providers.py` |
| `GITHUB_STEP_SUMMARY` | set by GitHub Actions | The file that receives the regression test summary. | `.github/scripts/report_regression.py` |

- `check_llm_providers.py` also reads `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY` and `OPENROUTER_FALLBACK_MODELS`. By default, it probes all four providers.
- `batch_test.py` writes `ATESOR_PLATFORM`, `ATESOR_TARGET` (from its `--target` flag) and `ATESOR_RUN_DEADLINE` into the environment of each `main.py` child process.
- `batch_test.py` never passes `--optimize`, so the performance mode variables have no effect on a batch run.
- `release-sandbox.sh` passes `VARIANT`, `EXPLICIT_VERSION`, `BUMP_MAJOR` and `TAGS` to its own embedded Python step. Its command-line flags set them. They are not user settings.

Refer to [Batch runs](/atesor/docs/guides/batch-runs/).

## Variables that the launcher sets

The `atesor-ai` launcher of the `.deb` package sets two variables before it starts `main.py`:

| Variable | Value | Purpose |
|---|---|---|
| `PYTHONDONTWRITEBYTECODE` | `1` | Python writes no bytecode files into `/opt`. |
| `PYTHONPATH` | `/opt/atesor-ai/app`, then the old value | Python finds the `src` package. |

## Variables in the sandbox images

The Dockerfiles set these variables in the sandbox. The build commands in the sandbox see them. Atesor code on the host does not read them.

| Variable | Value | Images |
|---|---|---|
| `GOFLAGS` | `-buildvcs=false` | all three |
| `GOTOOLCHAIN` | `local` | all three |
| `GOPROXY` | `https://proxy.golang.org,direct` | all three |
| `GONOSUMCHECK` | `*` | all three |
| `GOPATH` | `/root/go` | all three |
| `CARGO_HOME` | `/root/.cargo` | all three |
| `RUSTUP_HOME` | `/root/.rustup` | all three |
| `CC` | `gcc` | all three |
| `CXX` | `g++` | all three |
| `CCACHE_DIR` | `/workspace/.ccache` | `Dockerfile.debian`, `Dockerfile.native` |
| `DEBIAN_FRONTEND` | `noninteractive` | `Dockerfile.debian`, `Dockerfile.native` |
| `PIP_BREAK_SYSTEM_PACKAGES` | `1` | `Dockerfile.native` |
| `PATH` | `/root/.cargo/bin:/root/go/bin:/usr/local/go/bin`, then the base `PATH` | `Dockerfile` |
| `PATH` | `/root/.cargo/bin:/root/go/bin:/usr/local/go/bin:/usr/lib/ccache`, then the base `PATH` | `Dockerfile.debian`, `Dockerfile.native` |

The three images are `Dockerfile` (Alpine), `Dockerfile.debian` (Ubuntu jammy) and `Dockerfile.native` (Debian trixie). Refer to [Sandboxes](/atesor/docs/guides/sandboxes/).

## Variables that performance mode sets in the sandbox

Performance mode sets these variables for its own commands in the sandbox. They are not user settings. Do not set them yourself.

| Variable | Value | Purpose |
|---|---|---|
| `QEMU_CPU` | the `--emulate-cpu` or `ATESOR_QEMU_CPU` model | On `qemu`, the probe, the tune checks and the workload runs use this CPU model. |
| `CC`, `CXX` | the wrapper scripts `cc` and `cxx` in `<tree>/.atesor/` | A C or C++ tune builds through the wrappers. |
| `MAKEFLAGS` | `CC=<tree>/.atesor/cc CXX=<tree>/.atesor/cxx` | A `CC = gcc` line in a Makefile cannot replace the wrappers. |
| `ATESOR_REAL_CC`, `ATESOR_REAL_CXX` | the compiler of the tune, for example `gcc` and `g++` | The wrappers run this compiler. |
| `ATESOR_CC_FLAGS` | the flags of the tune | The wrappers add these flags after the flags of the project. |
| `ATESOR_CC_LOG` | `<tree>/.atesor/cc.log` | The wrappers log each compiler call. |
| `GORISCV64` | the Go ISA level from the probe | The Go ISA tune. |
| `GOFLAGS` | `-buildvcs=false -pgo=<profile>` | The Go profile-guided optimization (PGO) tune. |
| `RUSTFLAGS` | a target CPU or target features from the probe | The Rust ISA or target CPU tune. |
| `CARGO_PROFILE_RELEASE_LTO`, `CARGO_PROFILE_RELEASE_CODEGEN_UNITS` | `fat`, `1` | The Rust link-time optimization (LTO) tune. |
| `CCACHE_DISABLE` | `1` | The C and C++ PGO builds do not use ccache. |
| `ATESOR_PAD` | 0 to 4096 `x` characters, random for each run | Each timed run gets another stack layout. |
| `ATESOR_INPUT` | the input file, or `/dev/null` | A Go benchmark that the optimizer agent writes reads its input from this file. |

`<tree>` is the copy of the repository that one tune builds in, for example `/workspace/repos/zlib.opt/tune2`. Refer to [Output files](/atesor/docs/reference/output-files/).
