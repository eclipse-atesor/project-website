---
title: Few-shot examples
description: The Atesor few-shot example store in data/examples, with one file per agent, the schema, how runs add examples, the cap of 100 and manual examples.
sidebar:
  order: 5
---

A few-shot example is a short case that worked before. Eclipse Atesor™ adds the examples that match best to an LLM prompt, so that the model sees a known pattern. Atesor keeps the examples in JSON files under `data/examples/`, one file for each agent, and adds new examples after each verified port.

## Which files are there, and which code reads them?

`src/memory.py` loads the files with the `AgentMemory` class. The schema description is in `data/examples/README.md`.

| File | Format | Used by |
| --- | --- | --- |
| `scout_examples.json` | v2.0 | The scout prompt in `scout_node()` |
| `fixer_examples.json` | v2.0 | The fixer prompt in `fixer_node()` |
| `builder_examples.json` | v2.0 | No prompt. Runs add examples, but no prompt uses them. |
| `supervisor_examples.json` | legacy v1.0 (`context`, `expected_output`) | No code. The supervisor routes by rules and makes no LLM call. |

Each v2.0 file has the keys `version`, `description`, `general_guidelines` and `examples`. No code in `src/` reads `general_guidelines`.

On `main` at commit `e28f0d0`, the files hold these examples:

| File | Examples | Manual | Auto-learned |
| --- | --- | --- | --- |
| `scout_examples.json` | 52 | 8 | 44 |
| `fixer_examples.json` | 35 | 12 | 23 |
| `builder_examples.json` | 51 | 6 | 45 |
| `supervisor_examples.json` | 10 | no `source` field | none |

## Where does a run read and write the files?

Atesor uses the `data/examples/` directory under its state home:

- A writable source checkout uses its own `data/examples/`. Git tracks these files.
- An installed `atesor-ai` uses `$ATESOR_HOME/data/examples/`, or `~/.local/share/atesor-ai/data/examples/` when `ATESOR_HOME` is not set.

When `src/memory.py` loads, it copies each bundled file into the state home if the file is not there. It never replaces a file that exists.

## What does an example look like?

All v2.0 examples share these fields:

| Field | Meaning |
| --- | --- |
| `id` | A unique name, for example `scout-001`. Auto-learned examples use `<agent>-auto-NNN`. |
| `name` | A readable name |
| `tags` | Words for the relevance score, for example `["go", "cgo"]` |
| `build_system` | The build system, for example `cmake`, `go`, `autotools` or `make` |
| `source` | `manual` or `auto`. A missing value counts as `manual`. |
| `repo_name` | The repository that the example comes from |
| `sandbox` | `alpine-riscv64` or `debian-riscv64` |
| `timestamp` | The date, `YYYY-MM-DD` |
| `reasoning` | Why the pattern applies |

Each agent adds its own fields:

- **Scout**: `trigger` (for example `build_system`, `has_main`, `main_path`, `module_dir`) and `plan` (a list of `phases`, each with `name` and `commands`).
- **Fixer**: `error_pattern` (a Python regular expression) and `fix` (`analysis`, `strategy`, and `actions` with `type` and `command`).
- **Builder**: `phases` and an optional `timeout_recommendation`.

This fixer example comes from `data/examples/README.md`:

```json
{
  "id": "fixer-001",
  "name": "Missing pkg-config module",
  "tags": ["dependency", "pkgconfig"],
  "build_system": "cmake",
  "sandbox": "debian-riscv64",
  "error_pattern": "No package 'zlib' found",
  "fix": {
    "analysis": "The development package is missing.",
    "strategy": "Install the canonical distro package.",
    "actions": [
      {"type": "command", "command": "apt-get install -y zlib1g-dev"}
    ]
  },
  "reasoning": "zlib1g-dev provides zlib.pc on Debian/Ubuntu."
}
```

## How does Atesor choose the examples for a prompt?

The scout and the fixer call `format_few_shot_examples()` with at most 2 examples and at most 2000 characters. `AgentMemory.get_relevant_examples()` then does these steps:

1. It removes each example from a different sandbox. The sandbox of the run is `<platform>-riscv64`. The `ubuntu` platform uses the Debian profile, so its sandbox is `debian-riscv64`. An example with no `sandbox` counts as `alpine-riscv64`.
2. It gives a score to each example that it keeps. The table below lists the rules.
3. It caps each score at 1.0 and keeps only examples with a score above 0.
4. It returns the examples with the highest scores.

| Match | Score |
| --- | --- |
| Same build system | +0.5 |
| The fixer `error_pattern` matches the error message (case-insensitive) | +0.4 |
| Each tag that occurs in the error message | +0.15 |
| Same `has_main` value | +0.1 |
| Same `module_dir` | +0.15 |
| Both have a `module_dir`, but different | +0.05 |
| The project uses cgo and the example has the tag `cgo` | +0.2 |
| Same sandbox | +0.25 |

The scout context holds `build_system`, `has_main`, `main_path` and `module_dir`. The fixer context holds `build_system` and `error_message`. No caller sets `has_cgo`, so the cgo rule adds no score.

If no example matches the sandbox, the prompt gets no examples. An `error_pattern` that is not a valid regular expression adds no score.

## How do runs add examples?

`finish_node()` calls `_save_learning_data()` after a successful build. Only a verified port adds examples: the build must succeed, and the artifact scan must prove riscv64 output. An unverified or wrong-architecture build adds nothing.

| Agent | What a verified port adds |
| --- | --- |
| Scout | One example: name `Auto: <repo> (<build system>)`, tags `[<build system>, <repo>]`, the `trigger` and the `plan` phases |
| Fixer | One example for each fix that worked: the first 80 characters of the error message as an escaped regular expression, the strategy, and each executed command as an action |
| Builder | One example with the phases. `timeout_recommendation` is `600s` for more than 2 phases, else `120s`. |

The same step writes the recipe cache entry. See [Recipe cache](/atesor/docs/guides/recipe-cache/). Performance mode (`--optimize`) adds no few-shot example. After a native measurement, it can add its result to the recipe cache entry.

`save_learned_example()` writes each example with these rules:

- It needs `name` and `build_system`. Without them it saves nothing.
- It sets `sandbox` from the active platform when the field is empty.
- It skips a duplicate. In the same sandbox, an example is a duplicate when one of these conditions is true:
  - It has the same `repo_name` and `build_system`.
  - It has the same set of commands (scout and builder only).
  - It has the same `error_pattern` and `build_system` (fixer only).
- It sets `id` to `<agent>-auto-NNN`, one above the highest existing auto number, `source` to `auto` and `timestamp` to the date.
- It holds a file lock, `<file>.lock` next to the JSON file, and replaces the file in one atomic step.

## What is the cap?

`MAX_EXAMPLES_PER_AGENT` in `src/memory.py` is 100. When a file holds more than 100 examples after a save, Atesor keeps all manual examples and removes the oldest auto-learned examples first, by `timestamp`.

:::caution
When a file goes above 100, Atesor keeps only the entries with `source` set to `manual` or `auto`. It removes an entry with another `source` value. It never removes a manual entry, so a file with more than 100 manual entries stays above the cap.
:::

## How do CI runs merge new examples?

The `batch-port` workflow collects the `data/` changes of all shards. `.github/scripts/merge_data_artifacts.py` merges the example files by `id`. A `manual` entry wins over an entry that is not manual. Between two entries of the same kind, the newer `timestamp` wins. The workflow then opens a draft pull request with the merged `data/` files.

## How do you add an example by hand?

1. Choose the file for the agent: `scout_examples.json` or `fixer_examples.json`. No prompt uses builder examples, and no code reads `supervisor_examples.json`.
2. Give the example a unique `id` that does not have the `<agent>-auto-` form. The manual scout examples use `scout-000` to `scout-007`, and the manual fixer examples use `fixer-000` to `fixer-011`.
3. Set `source` to `manual`, or leave the field out. Atesor never removes a manual example at the cap.
4. Set `sandbox` to `alpine-riscv64` or `debian-riscv64`. Without the field, the example counts as Alpine and never appears in Debian or Ubuntu prompts.
5. Use the package manager of that sandbox in each command: `apk` for Alpine, `apt-get` for Debian and Ubuntu.
6. For a fixer example, write one command in each action. The fixer validators reject a chained fix command, so a chained example teaches the model a form that fails.
7. Keep the file valid JSON. If `json.load()` fails, Atesor logs an error and loads no examples for that agent.
8. Run the tests:

```bash
PYTHONPATH=. pytest tests/test_memory.py tests/test_data_files.py
```

`tests/test_data_files.py` fails when a JSON object under `data/` holds the same key twice.

For how the prompts use the examples, see [LLM layer](/atesor/docs/architecture/llm-layer/).
