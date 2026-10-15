---
title: Agent state
description: The AgentState dataclass in src/state.py, its field groups, the error taxonomy, severity inference and the escalation checks.
sidebar:
  order: 2
---

Eclipse Atesor™ keeps everything about one port in a single `AgentState` dataclass, defined in `src/state.py`. Every node reads it and writes it, and every routing decision comes from its fields. Read this page before you change a node, a routing function or an error pattern.

## Why is the state the contract between nodes?

The graph in `src/graph.py` is a `StateGraph(AgentState)`. All nodes receive the same `AgentState` object, change it in place, and return it. No node calls another node. A node tells the next node what happened through state fields.

The routing functions read only state fields, for example `build_status`, `last_error_category` and `attempt_count`. The final report, the exit code, the zip manifest and the learning gate also read the state. At the end of a run, `main.py` writes the full state to `<repo>_state_<timestamp>.json`.

`CONTRIBUTING.md` states the rule: `AgentState` is the single source of truth. Mutate it in place inside every node, and never construct a fresh one. In a run, `create_initial_state(repo_url, max_attempts, optimize, emulate_cpu, cached_recipe)` makes the only instance. It rejects a URL that is not a plain `http(s)` URL, derives `repo_name`, and sets `repo_path` to `/workspace/repos/<repo_name>`. The last 3 arguments come from the performance mode flags and default to off.

## What are the main field groups?

The source groups the fields with comments. This table shows the important fields in each group.

| Group | Important fields | Written by |
|---|---|---|
| Repository | `repo_url`, `repo_name`, `repo_path`, `repo_tree` | `create_initial_state`, `init_node` |
| Task planning | `package_analysis`, `task_plan`, `current_phase` | `analyst_node`, `cached_recipe_node`, all nodes |
| Build | `build_system_info`, `build_plan`, `build_status` | `init_node`, planners, all nodes |
| Dependencies | `dependencies` | `init_node` |
| Architecture | `arch_specific_code` | `init_node` |
| Execution tracking | `attempt_count`, `max_attempts`, `last_successful_phase` | `add_error()`, `builder_node`, `fixer_node` |
| Error handling | `last_error`, `last_error_category`, `last_error_severity`, `error_history`, `fixes_attempted` | `add_error()`, `fixer_node` |
| Cost tracking | `api_calls_made`, `api_cost_usd`, `api_tokens_in`, `api_tokens_out`, `scripted_ops_count`, `execution_start_time` | `log_api_call()`, `log_scripted_op()` |
| Caches | `context_cache`, `file_content_cache`, `command_results_cache` | all nodes |
| Heuristic plan facts | `scout_build_system_result`, `scout_deps_result`, `scout_arch_issues_result` | `heuristic_plan_node` |
| Outputs | `patches_generated`, `porting_recipe`, `build_artifacts`, `curated_artifacts`, `artifact_verification`, `package_tests` | `fixer_node`, `cached_recipe_node`, `verify_node`, `finish_node` |
| Performance mode | `optimize_requested`, `emulate_cpu`, `cached_recipe`, `machine_profile`, `optimization` | `create_initial_state`, `cached_recipe_node`, `optimize_node` |
| Audit | `audit_trail`, `current_agent`, `messages` | `log_event()`, `@agent_node`, `main.py` |

Some fields need a short note:

- `task_plan` is a fixed structural record from `create_default_plan()`. No LLM writes it, and no routing function reads its content.
- `build_status` takes one of 8 `BuildStatus` values: `PENDING`, `PLANNING`, `SCOUTING`, `BUILDING`, `FIXING`, `SUCCESS`, `FAILED` and `ESCALATED`.
- `last_successful_phase` lets the builder resume at the phase that failed.
- `command_results_cache` keys each command by its MD5 hash. The builder skips a command that already has a cached success.
- `artifact_verification` holds the last scan verdict: `verified`, `wrong_arch` or `unverified`. It is `None` until `verify_node` runs.
- `package_tests` holds the non-gating test result. It is `None` until `finish_node` runs. Performance mode runs the same test command again in each tune tree.
- `optimize_requested` is true only with `--optimize`. `route_finish_to_next` reads it.
- `emulate_cpu` holds the QEMU CPU model for performance mode on the QEMU target, or `None`.
- `cached_recipe` holds a verified recipe cache entry. `main.py` sets it only with `--optimize` and without `--force`. `route_init_to_next` reads it, and `cached_recipe_node` sets it to `None` when the entry has no command.
- `machine_profile` and `optimization` are `None` until `optimize_node` runs. The `status` of `optimization` is `accepted`, `no gain`, `not confirmed`, `not measured`, `checked`, `skipped` or `error`. See [Performance mode internals](/atesor/docs/architecture/optimize/).
- `tests_run` and `subgraph_outcome` are declared, but no code on `main` sets them.

The state also uses these dataclasses: `CommandResult`, `ErrorRecord`, `FixAttempt`, `ArchSpecificCode`, `BuildPhase`, `BuildPlan`, `DependencyInfo`, `TaskPhase`, `TaskPlan`, `BuildSystemInfo` and `PackageAnalysis`. The [LLM layer](/atesor/docs/architecture/llm-layer/) page describes `PackageAnalysis`.

## How does the state count attempts?

`add_error(error)` is the only place that increments `attempt_count`. It also appends the record to `error_history` and copies its message, category and severity into the `last_error*` fields. So an attempt is one recorded error, not one fix.

These events record an error and use one attempt:

- A build command that fails after all recovery heuristics.
- A wrong-architecture verdict from `verify_node`.
- A scout failure that uses the fallback plan.
- A fixer response that is not valid.
- A clone that fails in `init_node`.
- An exception that `@agent_node` catches.

`max_attempts` is 5 by default. The `--max-attempts` (`-m`) flag changes it.

## What is the error taxonomy?

`ErrorCategory` has 14 values. `classify_error(message)` assigns one category from the lower-case error text. It checks pattern groups in a fixed order, and the first match wins.

| Order | Category | Example patterns |
|---|---|---|
| 1 | `RATE_LIMIT` | `rate limit`, `too many requests`, `429`, `quota exceeded` |
| 2 | `DEPENDENCY` | package manager lock messages, for example `unable to lock database` |
| 3 | `DISK_SPACE` | `no space left`, `virtual memory exhausted`, `exit 137` |
| 4 | `NETWORK` | exit status 124, `timed out` |
| 5 | `CONFIGURATION` | `repository '...' not found` |
| 6 | `NETWORK` | `could not read username`, `authentication failed`, `connection`, `unreachable` |
| 7 | `CONFIGURATION` | a stale `config.guess` or `config.sub` that does not know `riscv64` |
| 8 | `ARCHITECTURE` | `immintrin.h`, `cpuid.h`, `unsupported architecture`, `-march=native`, `invalid instruction mnemonic`, `sse`, `avx`, `neon` |
| 9 | `LINKING` | `relocation truncated to fit`, `r_riscv_hi20`, `__atomic_load_`, `undefined reference`, `cannot find -l` |
| 10 | `DEPENDENCY` | `cmake error` with `could not find <name>` |
| 11 | `DEPENDENCY` | `no package '<name>' found`, `unable to locate package`, `has no installation candidate` |
| 12 | `MISSING_TOOLS` | `command not found`, `cmake: not found` |
| 13 | `CONFIGURATION` | `possibly undefined macro`, `autoreconf: error` |
| 14 | `CONFIGURATION` | `configure` with `syntax error` |
| 15 | `COMPILATION` | Rust `error[E0000]` codes, `could not compile`, `undeclared`, `implicit declaration` |
| 16 | `CONFIGURATION` | `configure: error`, `no rule to make target`, `no required module provides`, `inconsistent vendoring` |
| 17 | `DEPENDENCY` | `cannot find`, `not found`, `no such file`, `module not found` |
| 18 | `PERMISSION` | `permission denied`, `access denied`, `forbidden` |
| 19 | `DISK_SPACE` | a line that is only `killed` |
| 20 | `CONFIGURATION` | Python exception names, for example `keyerror` |
| 21 | `CONFIGURATION` | `empty repository` |
| 22 | `MISSING_TOOLS` | `go.mod requires go >=`, `requires rust version` |
| 23 | `UNKNOWN` | no match |

The other 3 categories are `LICENSE_INCOMPATIBLE`, `REQUIRES_HARDWARE` and `ARCHITECTURE_IMPOSSIBLE`. No code path on `main` sets them. They exist for the severity and escalation checks.

:::note
The builder reports a failed command as `Build command failed: <command> (exit <code>) - <output>`. An OOM kill (out-of-memory kill) therefore contains `exit 137`, which matches `DISK_SPACE`. `DISK_SPACE` is a fundamental blocker, so the supervisor escalates the run the next time it routes. The builder tries a serialized retry before it records that error. See [Recovery heuristics](/atesor/docs/architecture/recovery-heuristics/).
:::

## How does Atesor infer severity?

`FailureSeverity` has 3 values: `low`, `medium` and `high`. `create_error_record()` calls `infer_failure_severity(category, command, message)` when the caller gives no severity. The function checks these rules in this order:

1. The command starts with `which `: `low`.
2. The category is `LICENSE_INCOMPATIBLE`, `REQUIRES_HARDWARE`, `ARCHITECTURE_IMPOSSIBLE`, `PERMISSION` or `DISK_SPACE`: `high`.
3. The command contains `git clone`, `git pull`, `apt-get update`, `apt update`, `apk update` or `apk add`: `high`.
4. The category is `CONFIGURATION`, `DEPENDENCY`, `COMPILATION`, `LINKING`, `NETWORK`, `RATE_LIMIT`, `MISSING_TOOLS` or `ARCHITECTURE`: `medium`.
5. The message contains `not found` and `which `: `low`.
6. All other errors: `medium`.

`init_node` sets `high` explicitly for a failed clone. The routing functions read the category, not the severity. Atesor writes the severity to the error record, the escalation report and the final terminal output.

## When does a run escalate?

`should_escalate(state)` returns `(True, reason)` for the first check that matches:

1. `attempt_count` is `max_attempts` or more: `Maximum attempts (N) reached`.
2. The run is in an error loop: `Stuck in error loop with no progress`.
3. `last_error_category` is `LICENSE_INCOMPATIBLE`, `REQUIRES_HARDWARE`, `ARCHITECTURE_IMPOSSIBLE`, `PERMISSION` or `DISK_SPACE`: `Fundamental blocker: <category>`.
4. `api_cost_usd` is more than 1.0: `API cost limit ($1.0) exceeded`.

`route_supervisor_to_next` calls `should_escalate()` after it checks for `SUCCESS` and `ESCALATED`. A `SUCCESS` therefore always goes to `finish_node`, also at the attempt or cost limit. The subgraph routing functions also stop at `max_attempts`. The [overview](/atesor/docs/architecture/overview/) shows the full order of checks.

The LLM calls of the optimizer agent also add to `api_cost_usd`. They run in `optimize_node`, after `finish_node`, so no escalation check follows them.

`is_in_error_loop()` compares the last 3 records in `error_history`. Each record gets a signature: its category plus one normalized error line. The function picks the first line that contains a marker such as `error`, `fatal` or `undefined reference`. When no line has a marker, it picks the first line. It then replaces paths with `<path>`, line and column numbers with `:<n>`, hex values with `<hex>`, and other numbers with `<n>`. The run is in a loop when the 3 signatures are the same.

## Which helper methods change the state?

| Method | What it does |
|---|---|
| `add_error(error)` | Appends to `error_history`, keeps the last 200, sets the `last_error*` fields, adds 1 to `attempt_count`. |
| `add_fix_attempt(fix)` | Appends a `FixAttempt`. The builder later marks it as a success. |
| `log_api_call(cost, tokens_in, tokens_out, calls)` | Adds calls, cost and tokens. |
| `log_scripted_op(operation)` | Adds 1 to `scripted_ops_count` and writes an audit event. |
| `log_event(type, data)` | Appends to `audit_trail` and keeps the last 2000 events. |
| `cache_command_result()`, `get_cached_command_result()`, `forget_command_result()` | Manage `command_results_cache`. |
| `add_build_artifact(filepath, type, architecture)` | Appends to `build_artifacts`. |
| `is_verified_success` | True only for `SUCCESS` with the verdict `verified`. |
| `to_dict()`, `save_to_json(path)` | Serialize the state. Enums become their values. |

The caps of 200 errors and 2000 audit events keep a long escalated run from growing the state JSON without limit.

`state.py` also has `get_next_action_recommendation(state)`. `tests/test_state.py` uses it, but the graph routing does not call it.
