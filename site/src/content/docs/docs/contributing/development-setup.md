---
title: Development setup
description: Prepare a source checkout of Atesor for development, from the clone and the Python dependencies to a first port that runs from source.
sidebar:
  order: 1
---

This page tells you how to prepare a source checkout of Eclipse Atesor™ for development. You clone the repository, install the Python dependencies, add an LLM key, build the riscv64 sandbox and run a port with `python3 main.py`.

## What do you need?

- A host with Docker. A host that is not RISC-V also needs QEMU emulation for riscv64. See [Requirements](/atesor/docs/getting-started/requirements/).
- Python 3.10 or later. The CI workflows use Python 3.11.
- `git`.
- An API key for one LLM provider: Gemini, OpenAI, OpenRouter or Anthropic.

## Get the source

```bash
git clone https://github.com/eclipse-atesor/atesor
cd atesor
```

The project is not a pip package. You run `main.py` from the checkout, and every test command sets `PYTHONPATH=.`.

## Install the Python dependencies

`CONTRIBUTING.md` installs the dependencies with `pip install -r requirements.txt`. A virtual environment isolates these packages from the system Python:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

`requirements.txt` holds the runtime packages (LangChain, LangGraph, the Docker SDK, `filelock` and others) and the development tools `pytest`, `pytest-asyncio`, `black` and `flake8`. The `.dockerignore` file excludes `.venv/` and `venv/`, so the build context of the sandbox image does not include the environment.

## Add an LLM key

Copy the template, then edit `.env`:

```bash
cp .env-example .env
```

Set `LLM_PROVIDER` and the key for that provider. `src/models.py` checks these names:

| `LLM_PROVIDER` | Key variable |
| --- | --- |
| `gemini` (default) | `GOOGLE_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |
| `anthropic` | `ANTHROPIC_API_KEY` |

For `anthropic`, the key check also needs the `langchain-anthropic` package. `requirements.txt` lists it.

`.gitignore` lists `.env`, so git does not track the file. Never put a key in a tracked file. For the other settings, see [Configure the LLM](/atesor/docs/getting-started/configure-llm/) and [Environment variables](/atesor/docs/reference/environment-variables/).

## Install the merge driver for the recipe cache

Run this script one time in each clone:

```bash
sh .github/scripts/setup_git_merge_driver.sh
```

The script changes only your clone: `.git/config` and `.git/info/attributes`. After it, git merges `data/recipe_cache.json` by meaning. When both sides change the same recipe, the newest recipe wins. Without the driver, git stops at a conflict for that file, and `.gitattributes` gives the manual steps.

## Enable RISC-V emulation

On a host that is not RISC-V, register the QEMU handlers one time:

```bash
docker run --privileged --rm tonistiigi/binfmt --install all
```

`main.py` checks for the `qemu-riscv64` handler before it prepares the sandbox. If the handler is missing, `main.py` tries one time to register it with `tonistiigi/binfmt --install riscv64`.

## Build the sandbox

```bash
python3 main.py --setup-only                     # Alpine
python3 main.py --setup-only --platform debian   # Debian/Ubuntu
```

Without `--platform` and without `ATESOR_PLATFORM`, Atesor uses the Alpine sandbox. The first image build runs under QEMU emulation, and the code comments give 15 to 45 minutes for it. Later commands use the image again. For the sandbox profiles, see [Sandboxes](/atesor/docs/guides/sandboxes/).

## Where does a source checkout keep its state?

A writable source checkout keeps the runtime state in the checkout itself:

- `workspace/` holds the cloned repositories, the outputs and the logs. The native target uses `workspace-native/`.
- `data/examples/` holds the few-shot examples.
- `data/recipe_cache.json` holds the recipe cache.

Set `ATESOR_HOME` to move the state to another directory. Git tracks the files under `data/`, so a verified port changes tracked files. Check `git status` before you commit. Commit these files only when you want to share the result. See [Few-shot examples](/atesor/docs/contributing/few-shot-examples/) and [Recipe cache](/atesor/docs/guides/recipe-cache/).

## Run a port from source

```bash
python3 main.py --repo https://github.com/madler/zlib --verbose
```

The bundled recipe cache can hold an entry for the package. A cache hit renders the recipe again and makes no LLM call and no build. Add `--force` to run the full pipeline:

```bash
python3 main.py --repo https://github.com/madler/zlib --verbose --force
```

For a real riscv64 machine instead of QEMU, see [Native RISC-V machine](/atesor/docs/guides/native-riscv/). To run the tests and the lint check, see [Tests and checks](/atesor/docs/contributing/tests/).

## Which rules must a change keep?

`CONTRIBUTING.md` lists these architecture rules. A change that breaks one of them can break the graph.

1. `AgentState` is the single source of truth. Each node changes it in place and never makes a new one.
2. Each LangGraph node has the decorator `@agent_node(AgentRole.X)` from `src/graph.py`.
3. Each LLM call uses `invoke_llm(llm, messages, timeout=120)` and then `log_llm_call(...)`. Do not call `llm.invoke()` directly.
4. Each shell command uses `execute_command()` in `src/tools.py`. Do not call `subprocess` directly for sandbox work.
5. Path constants come from `src/config.py`. Do not hardcode `/workspace` or host paths.
6. Distro logic uses `get_active_profile()` in `src/platforms.py`. Do not hardcode `atesor-ai-sandbox`, `apk` or `apt-get`.
7. Writes to the recipe cache and the few-shot files hold a `filelock` lock.
8. Go builds pass `-buildvcs=false`.

## How do you submit a change?

1. Make a branch from `main`, or from `dev` if a maintainer asks for it.
2. Make focused commits with clear messages. `CONTRIBUTING.md` prefers the Conventional Commits style: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`.
3. Run `PYTHONPATH=. pytest` and make sure that all tests pass.
4. Open a pull request on [GitHub](https://github.com/eclipse-atesor/atesor). Say what changed and why. List new environment variables, new CLI flags and breaking changes. Add the test output for each new feature.
5. Keep each pull request small. Split a change that touches more than one concern.

## What about PROJECT.md?

`llm.txt` names `PROJECT.md` as the canonical context file of the project. On `main`, `.gitignore` lists `PROJECT.md`, so a fresh clone does not contain the file. Describe each behaviour change in the pull request, as `CONTRIBUTING.md` asks.
