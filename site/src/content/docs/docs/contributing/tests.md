---
title: Tests and checks
description: Run the Atesor test suite and the lint and format checks, see what CI runs, and find which test file guards which part of the code.
sidebar:
  order: 2
---

Eclipse Atesor™ has a pytest suite in `tests/` that needs no LLM key, no sandbox container and no network. This page gives the CI commands, the lint and format tools, and the code that each test file guards.

## How do you run the tests?

Run the tests from the root of the checkout. The project is not a pip package, so every test command sets `PYTHONPATH=.`:

```bash
PYTHONPATH=. pytest                                   # full suite
PYTHONPATH=. pytest tests/test_graph_routing.py       # one file
PYTHONPATH=. pytest tests/test_state.py::TestStateMutation::test_add_error_updates_all_fields_and_attempt
PYTHONPATH=. pytest -k memory                         # by name
```

`pyproject.toml` sets the pytest options:

- `testpaths = ["tests"]`: pytest collects tests only from `tests/`.
- `addopts = "-ra --strict-markers"`: pytest prints a short summary of each test that did not pass, and an unknown marker is an error.

Run the suite in a git clone. A session fixture in `tests/conftest.py` runs `git ls-files data` and fails the run if a test changes a tracked file under `data/`.

Some tests run small programs on the host. `TestHarnessKitOnThisHost` in `tests/test_workload.py` needs `gcc`, `ar`, `nm`, `ldd` and `bash` on the host. Other classes skip when `gcc`, `nm`, `ldd`, `git` or `rsync` is missing.

## What does CI run?

The `Regression Tests` workflow (`.github/workflows/regression-tests.yml`) runs on each push to `main` or `dev`, on each pull request into these branches, and on manual dispatch. It uses Python 3.11 and installs `requirements.txt`. Each test category runs as a separate job:

```bash
PYTHONPATH=. python3 -m pytest <files of the category> -q --junitxml=results-<category>.xml
```

A `report` job then runs this script:

```bash
python3 .github/scripts/report_regression.py --results-dir test-results --tests-dir tests
```

The script prints one results table and also writes it to the run summary. It fails in these conditions:

- A category has a failure or an error.
- A `tests/test_*.py` file is in no category, or in more than one category.
- A category names a file that does not exist.
- The run has no `results-*.xml` file.

The `report` job also fails when one of the category jobs failed.

:::caution
When you add a test file, add it to exactly one category in `.github/workflows/regression-tests.yml`. Otherwise the `report` job fails.
:::

The `Package .deb` workflow (`.github/workflows/package-deb.yml`) builds the release package. Before the build, it runs the full suite and a lint check:

```bash
PYTHONPATH=. python3 -m pytest -q
python3 -m flake8 main.py src/ tests/ .github/scripts/
```

## Which lint and format checks apply?

`CONTRIBUTING.md` sets these coding standards for all Python in the repository:

- PEP 8, with a hard limit of 79 characters for each line.
- Indentation of 4 spaces, with no tabs.
- Double quotes for strings.
- Type hints on each public function and method.
- Google-style docstrings on each public module, class, function and method.
- Import order by isort: standard library, then third-party, then local, with a blank line between the groups.
- `snake_case` for variables, functions and modules, `PascalCase` for classes, `UPPER_SNAKE` for constants.
- Few comments. Add a comment only when the reason for the code is not clear from the code.

Run the checks from the root of the checkout:

```bash
python3 -m flake8 main.py src/ tests/ .github/scripts/
black src/ tests/ main.py
isort src/ tests/ main.py
```

The tools read their settings from the repository:

| Tool | File | Settings |
| --- | --- | --- |
| flake8 | `setup.cfg` | `max-line-length = 79`, `docstring-convention = google`, ignores `E203`, `W503` and `D107`, ignores `D102` in `tests/`, excludes `workspace`, `workspace-native`, `artifacts`, `data` and caches |
| black | `pyproject.toml` | `line-length = 79`, `target-version = ["py310"]` |
| isort | `pyproject.toml` | `profile = "black"`, `line_length = 79` |

`requirements.txt` lists `black` and `flake8`. It does not list `isort`, so install it yourself before you use it.

`CONTRIBUTING.md` says that CI does not enforce the linters yet. The `Regression Tests` workflow has no lint step. The `Package .deb` workflow runs `flake8`, so a lint error stops a release build.

## Which test file guards which code?

The table follows the categories of the `Regression Tests` workflow.

| Category | Test file | What it guards |
| --- | --- | --- |
| state-and-routing | `test_state.py` | `AgentState` helpers, enum names, `classify_error` patterns and their order, escalation checks |
| state-and-routing | `test_graph_routing.py` | Routing for init, cached recipe, analyst, heuristic plan, supervisor, finish and the build-fix subgraph, and the heuristic plan node |
| state-and-routing | `test_graph_agent_node.py` | The `agent_node` decorator: rate-limit retry and error escalation |
| graph-agents | `test_graph_agents.py` | The analyst, init, scout, fixer, builder, cached-recipe, optimize and terminal nodes, the read-only investigation of the fixer, expected-artifact checks and the auto-learning step |
| graph-agents | `test_graph_validators.py` | Validators for build plans, fix commands and fixer replies, fallback plans, command rewriters, the package test phase and the helper functions of the builder heuristics |
| execution-tools | `test_tools.py` | Command validation, package-manager helpers, Docker calls and patch application, with mocked subprocesses |
| execution-tools | `test_platforms.py` | Platform profiles: helpers, detection, overrides and name corrections |
| execution-tools | `test_config.py` | Workspace paths and Docker detection in `src/config.py` |
| execution-tools | `test_security_hardening.py` | The command whitelist for each command segment, single fix commands, secret values kept out of the argument list, file writes kept in the repository tree, unsafe repository URLs |
| llm-and-memory | `test_models.py` | API key checks, model pools, OpenRouter fallback lists, cost calculation, the Anthropic provider |
| llm-and-memory | `test_memory.py` | Few-shot examples, auto-learning, the recipe cache, the performance mode results in the recipe cache |
| llm-and-memory | `test_llm_helpers.py` | The validated LLM call with retry and fallback, and the reply format of Claude models |
| llm-and-memory | `test_llm_logger.py` | The LLM audit log, with one log file for each repository |
| llm-and-memory | `test_data_files.py` | The JSON files under `data/`: no duplicate keys, the recipe cache merge and the git merge driver |
| repo-analysis | `test_scripted_ops.py` | The scripted analysis, on small fake repositories on disk |
| repo-analysis | `test_evidence.py` | The repository evidence for LLM prompts |
| repo-analysis | `test_knowledge.py` | The system knowledge text for prompts |
| artifacts-packaging | `test_artifact_scanner.py` | The ELF and archive scan program, which runs with the host `python3` on files with real ELF and ar headers |
| artifacts-packaging | `test_artifact_curator.py` | Rule-based and LLM artifact curation |
| artifacts-packaging | `test_packager.py` | The zip package and its manifest, with the schema 3 sections of performance mode |
| cli-main | `test_main.py` | The CLI in `main.py`: sandbox preparation, reports, cleanup, the native environment, and `--optimize`, `--emulate-cpu` and `--probe` |
| regression-suites | `test_concurrency.py` | Parallel workers: one image build for N workers, the container pool, parallel clones, parallel recipe cache writes |
| regression-suites | `test_masterplan_fixes.py` | Fixes for groups of failed packages, the toolchain pins in the Dockerfiles, and the package URLs in `full.json` |
| regression-suites | `test_plan_remaining.py` | The planner that skips packages that a monthly release already holds, and the helpers `missing_pkgs.py` and `slice_pkgs.py` |
| regression-suites | `test_resource_lifecycle.py` | Log file handles, the Docker client and temporary patch files are closed or removed on each path. The clone token header stays out of command strings and the git config. |
| regression-suites | `test_shard_planning.py` | Shard counts and slices for the batch and retry workflows |
| native-target | `test_target.py` | Target selection and the SSH settings |
| native-target | `test_preflight.py` | The native preflight and its use in `main.py` |
| native-target | `test_sandbox.py` | The exec command line, secrets and transport errors |
| native-target | `test_mirror.py` | The local copy of the repositories on the native machine |
| native-target | `test_batch_test.py` | `batch_test.py`: the native target (worker count, machine probe, `--target`), the toolchain probe, the run deadline, the lock for each repository, the platform choice and the exit code |
| performance-mode | `test_machine.py` | The machine probe in `src/machine.py`, the machine profile, and the rules that turn the profile into flags |
| performance-mode | `test_workload.py` | The package profile and the workload choice in `src/workload.py`: the checks of the agent replies, the sizing on the baseline and the harness build |
| performance-mode | `test_bench.py` | The statistics, the grammar for workload commands, the timing protocol and the runner program in `src/bench.py` |
| performance-mode | `test_optimize.py` | The tunes, the replay of the build, the gates and the full flow in `src/optimize.py`, with a fake sandbox |

## How do you write a test?

- Put the test in the file for the module that you change. `CONTRIBUTING.md` asks for one test file for each `src/` module.
- Add a test for each bug fix and for each new public function.
- Most files use `unittest.TestCase`. Some files use plain pytest classes and functions.
- Write files to the `tmp_path` fixture, never to `data/` or `workspace/`.
- Do not start Docker, open a network connection or call an LLM. Mock `execute_command`. The fixture `stub_execute_command` in `tests/conftest.py` replaces it in one module.

The autouse fixtures in `tests/conftest.py` run for each test:

| Fixture | What it does |
| --- | --- |
| `_guard_tracked_data_files` | Fails the session if a test changes a tracked file under `data/` |
| `_no_package_test_phase` | Sets `ATESOR_PACKAGE_TEST_TIMEOUT=0`, so `finish_node` runs no package tests |
| `_clear_memory_instances` | Clears the cached few-shot memory before and after each test |
| `_restore_active_profile` | Sets the Alpine profile, so no test runs a real `docker exec` to detect the platform |
| `_reset_target_cache` | Clears the cached target (`qemu` or `native`) |
| `_reset_mirror_state` | Clears the state of the native mirror |
