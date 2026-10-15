---
title: Output files
description: Every file and folder that an Atesor run writes, with its location, format and main fields, from the recipe to performance mode results, the zip and the caches.
sidebar:
  order: 4
---

Eclipse Atesor™ writes its results, logs and caches under one state home. This page lists every file and folder that a run writes, where it goes, its format, and its main fields or sections. Use it to find a result, to parse a file in a script, or to clean up disk space.

## Where does Atesor write its files?

All runtime state goes under the state home. `src/config.py` selects the state home in this order:

1. `$ATESOR_HOME`, when it has a value.
2. `/workspace`, when Atesor itself runs in a container.
3. The source checkout root, when it has `.git` or `tests/` and you can write to it.
4. `$XDG_DATA_HOME/atesor-ai`. The default is `~/.local/share/atesor-ai`.

The workspace is a directory under the state home. Its name depends on the target:

| Target | Workspace |
|---|---|
| `qemu` | `<state home>/workspace` |
| `native` | `<state home>/workspace-native` |

Exception: when Atesor runs in a container on the `qemu` target and `ATESOR_HOME` has no value, the workspace is `/workspace`.

Common locations:

| How you run Atesor | State home | Workspace on `qemu` |
|---|---|---|
| `python3 main.py` in a source checkout | the checkout root | `<checkout>/workspace` |
| `atesor-ai` from the `.deb` | `~/.local/share/atesor-ai` | `~/.local/share/atesor-ai/workspace` |
| Either form, with `ATESOR_HOME` | `$ATESOR_HOME` | `$ATESOR_HOME/workspace` |

The results of the two targets never mix. They use different workspaces, different recipe cache keys and different zip names.

## Which directories does Atesor create?

`main.py` imports `src/config.py` at start-up, for every command. That import creates these directories when they are missing:

| Directory | Content |
|---|---|
| `<state home>/data/` | The recipe cache and the few-shot examples. |
| `<workspace>/repos/` | The cloned repositories, one directory for each repository name. With `--optimize`, also the `<repo>.opt/` tree. |
| `<workspace>/output/` | The recipe, the report, the state file and the patches of each run, and the machine profile of `--probe`. |
| `<workspace>/logs/` | The agent logs, the LLM call logs and the setup lock file. |
| `<workspace>/packages/` | The zip files from `--package`. |
| `<workspace>/.cache/` | Atesor creates it, but the code writes no files to it. |

On the `qemu` target, the sandbox container mounts the workspace at `/workspace`. A path such as `/workspace/repos/zlib` in a log is `<workspace>/repos/zlib` on your computer.

`--clean-workspace` also lists a `patches/` directory when it exists. The sandbox images create `/workspace/patches`, but the code writes no files to it. Atesor writes patches to `output/`.

## Which files does a run write?

| File | Directory | When Atesor writes it | Format |
|---|---|---|---|
| `<repo>_recipe.md` | `output/` | A port that ends with `SUCCESS`, or a recipe cache hit | Markdown |
| `<repo>_report_<YYYYMMDD_HHMMSS>.md` | `output/` | The end of each agent run, for each final status | Markdown |
| `<repo>_state_<YYYYMMDD_HHMMSS>.json` | `output/` | The end of each agent run, for each final status | JSON |
| `<repo>_patches_<YYYYMMDD_HHMMSS>/` | `output/` | The end of a run in which the fixer applied a patch | Folder of `.patch` files |
| `<owner>-<repo>-<YYYYMMDD-HHMMSS>-<platform>.zip` | `packages/` | `--package`, after a port that ends with `SUCCESS` | Zip |
| `machine_profile_<target>.json` | `output/` | `--probe` | JSON |
| `<repo>.opt/accepted/` | `repos/` | `--optimize`, when performance mode accepts a tune | Folder of riscv64 artifacts |
| `agent_<repo>.log` | `logs/` | Each command with `--repo` | Text log |
| `agent.log` | `logs/` | A command without `--repo` that passes the first checks, for example `--setup-only` or `--probe` | Text log |
| `agent-call_<repo>.log` | `logs/` | Each LLM call of a port | Text log |
| `agent-call.log` | `logs/` | Atesor creates it with a header when it first loads the LLM logger | Text log |
| `.container_setup.lock` | `logs/` | Each sandbox setup | Lock file |
| `recipe_cache.json` | `<state home>/data/` | A verified port, and a measured run of `--optimize` on `native` | JSON |
| `examples/<agent>_examples.json` | `<state home>/data/` | A verified port | JSON |

`<repo>` is the repository name that Atesor derives from the URL. `<target>` is `qemu` or `native`. Refer to [Command-line options](/atesor/docs/reference/cli/).

When the agent run raises an error or you interrupt it, Atesor writes no recipe, report, state file or patches for that run. This rule also applies during the optimize step of `--optimize`.

## What is in the recipe?

`<repo>_recipe.md` is the replayable porting guide. Atesor writes the same file name on each run, so a new run replaces the old recipe. The file has one of three forms.

### Recipe from the summarizer

After a successful build, the summarizer agent writes the recipe with an LLM. Its prompt asks for these H2 headings, in this order:

```markdown
## Executive Summary
## Prerequisites
## Build Instructions
## Architecture Notes
## Verification
## Known Issues & Recommendations
```

- `Executive Summary`: the status and a short portability verdict.
- `Prerequisites`: the package install commands for the sandbox distribution.
- `Build Instructions`: shell commands in fenced `bash` blocks, one block for each step, in order.
- `Architecture Notes`: the arch-specific items that the project needed. The LLM can omit this section.
- `Verification`: how to check that the binaries are riscv64, with `file` or `readelf -h`.
- `Known Issues & Recommendations`: open concerns and ideas for upstream changes.

The summarizer gets the build steps that ran, the artifacts, the verification verdict and the package test result. An LLM writes this text, so Atesor does not check that the output has each heading.

### Fallback recipe

When the summarizer call fails, Atesor writes a short recipe from the build plan:

```markdown
# RISC-V Porting Recipe: <repo>

The build commands succeeded. Artifact verification: <verdict>.

### <phase name>
```

Each phase has a `bash` block with its commands. When the run has artifacts, a `### Build Artifacts Generated` list follows. The text ends with an `**Artifact verification:**` line and a `**Package tests (not gating):**` line.

### Recipe from the cache

On a cache hit, Atesor writes the recipe again from the cache entry. When the entry stores the original Markdown, Atesor copies it unchanged. Else Atesor builds a recipe from the entry fields:

- A `# RISC-V Porting Recipe: <repo>` title.
- Bullets for the repository, the build system, the architecture, the sandbox and the last build time.
- A note that the recipe comes from the cache, and that `--force` makes a full guide from a fresh build.
- `## Dependencies`, `## Build Steps` (one `###` heading and one `bash` block for each phase), `## Patches / Fixes Applied` and `## Build Artifacts`, when the entry has data for them.

## What is in the report?

`<repo>_report_<YYYYMMDD_HHMMSS>.md` describes one agent run. Atesor writes a new report for each run, also for a failed run. The report has these sections:

1. `# RISC-V Porting Report: <repo>`.
2. `## Executive Summary`: the status, the target (`qemu` or `native`), the repository URL and the time of the report.
3. `## Metrics`: a table with the build status, the total duration, the attempts, the API calls, the scripted operations, the LLM tokens (in and out) and the cost in USD.
4. `## Artifact Verification`: the verdict, the reason and the source commit. A table gives the counts of riscv64 outputs, other-arch outputs and committed foreign files. Lists show up to 20 items of each kind, the ABI warnings and the expected artifacts that the build did not produce.
5. `## Package Tests (not gating)`: the result, the command with its exit code and duration, the reason, and the last 1500 characters of the output.
6. `## Machine Profile`: the facts of the machine probe and the settings that follow from them, in a code block.
7. `## Performance Mode (--optimize)`: the result of performance mode. Refer to [Performance mode section](/atesor/docs/reference/output-files/#what-is-in-the-performance-mode-section-of-the-report).
8. `## Build System Analysis`: the build system and each build phase with its commands. A `### Dependencies` part lists the build tools and the system packages.
9. `## Architecture-Specific Code`: up to 5 findings, each with its file, line and code snippet.
10. `## Patches Applied`: each patch, cut at 500 characters.
11. `## Error Resolution History`: each recorded error with its category and the first 300 characters of the message.
12. `## Recommendations`: next steps for the final status.

Atesor writes sections 6 and 7 only after the optimize step of `--optimize`. Section 6 needs a machine probe that ran. Atesor omits sections 9 to 11 when they have no data. The status text is one of these:

- `SUCCESS (riscv64 output verified)`
- `SUCCESS, NOT VERIFIED (no riscv64 output proven)`
- The final status of a run that did not succeed, for example `ESCALATED` or `FAILED`.

## What is in the state file?

`<repo>_state_<YYYYMMDD_HHMMSS>.json` is the full `AgentState` at the end of the run, as indented JSON. Enum values appear as strings, for example `"SUCCESS"`. Dates appear as strings. The top-level keys are:

| Group | Keys |
|---|---|
| Repository | `repo_url`, `repo_name`, `repo_path`, `repo_tree` |
| Planning | `task_plan`, `package_analysis`, `current_phase` |
| Build | `build_system_info`, `build_plan`, `build_status`, `tests_run` |
| Dependencies | `dependencies` |
| Architecture | `arch_specific_code` |
| Attempts | `attempt_count`, `max_attempts`, `last_successful_phase` |
| Errors | `last_error`, `last_error_category`, `last_error_severity`, `error_history`, `fixes_attempted` |
| Usage | `api_calls_made`, `api_cost_usd`, `api_tokens_in`, `api_tokens_out`, `scripted_ops_count`, `execution_start_time` |
| Caches | `context_cache`, `file_content_cache`, `command_results_cache` |
| Plan facts | `scout_build_system_result`, `scout_deps_result`, `scout_arch_issues_result` |
| Graph | `subgraph_outcome`, `messages`, `current_agent` |
| Results | `patches_generated`, `porting_recipe`, `build_artifacts`, `curated_artifacts`, `artifact_verification`, `package_tests` |
| Performance mode | `optimize_requested`, `emulate_cpu`, `cached_recipe`, `machine_profile`, `optimization` |
| Audit | `audit_trail`, `created_at`, `last_updated` |

`error_history` keeps the last 200 errors. `audit_trail` keeps the last 2000 events. The performance mode keys have these values:

- `optimize_requested`: `true` with `--optimize`.
- `emulate_cpu`: the `QEMU_CPU` model of the run, or `null`.
- `cached_recipe`: the verified recipe cache entry that became the build plan, or `null`.
- `machine_profile` and `optimization`: `null` until the optimize step runs. Refer to [Performance mode outputs](/atesor/docs/reference/output-files/#which-files-does-performance-mode-write).

Two keys hold the main verdicts of the port:

- `artifact_verification`: `status` (`verified`, `wrong_arch` or `unverified`), `verified`, `reason`, `source_commit`, `counts` (`riscv64`, `foreign`, `prebuilt_foreign`), the lists `riscv64`, `foreign` and `prebuilt_foreign` (up to 200 items each), `abi_warnings`, `examined`, `truncated`, `scan_error` and `expected_missing`. Each listed artifact has `path`, `type`, `arch`, `abi`, `size` and `prebuilt`.
- `package_tests`: `status` (`passed`, `failed`, `timeout`, `skipped` or `error`). After a test run, it also has `framework`, `command`, `exit_code`, `duration_seconds`, `timeout_seconds` and `output_tail` (the last 3000 characters). A `skipped` or `error` result has a `reason` instead.

Refer to [Agent state](/atesor/docs/architecture/agent-state/) and [Verification](/atesor/docs/architecture/verification/).

## What is in the patches folder?

`<repo>_patches_<YYYYMMDD_HHMMSS>/` holds one file for each patch that the fixer applied with success: `patch_1.patch`, `patch_2.patch` and so on. Each file holds the patch text that the fixer agent wrote, in the order of application. Atesor creates the folder only when the run applied at least one patch.

## Which files does performance mode write?

`--probe` and `--optimize` write the files in this part. Refer to [Performance mode](/atesor/docs/guides/optimize/) for the steps of the optimize step.

### Machine profile

`--probe` writes `machine_profile_<target>.json` to `output/`, as indented JSON. A new probe on the same target replaces the file. The optimize step does not write this file. It keeps the same data in the `machine_profile` key of the state file. The fields are:

| Field | Content |
|---|---|
| `kind` | `native` or `qemu`. |
| `emulated_cpu` | The `QEMU_CPU` model, or `null`. |
| `extensions` | The ISA extensions that the machine runs, in lower case. |
| `vlen` | The vector register length in bits, or `null` without the V extension. |
| `core` | The identity facts: `mvendorid`, `marchid`, `mimpid`, `uarch`, `model` and `compatible`. |
| `core_name` | The name of the known core that matched, or `null`. |
| `misaligned` | The speed of misaligned scalar access: `fast`, `slow`, `emulated`, `unsupported` or `unknown`. |
| `misaligned_source` | `hwprobe`, `timing test` or `none`. |
| `misaligned_test` | The result of the timing test. |
| `cores`, `allowed_cpus` | The number of usable CPUs, and the CPU numbers that the sandbox can use. |
| `mem_kib` | The total memory in KiB, or `null`. |
| `kernel`, `libc` | The kernel release, and `glibc <version>`, `musl` or `null`. |
| `board` | The governor, the frequencies, the temperatures, the perf settings, the load and the caches. |
| `toolchains` | The facts of each compiler, plus `go` and `rust`. |
| `label` | A short ISA label, for example `rv64gc+zba+zbb`. |
| `sources` | The sources that gave facts: `cpuinfo`, `hwprobe` and `tests`. |
| `tests` | The result of each test instruction: `present`, `absent` or `error`. |
| `warnings` | Warnings in plain language. |

### The `<repo>.opt` tree

The optimize step works in `/workspace/repos/<repo>.opt/` in the sandbox, next to the clone. Before the baseline build, Atesor removes the tree of an earlier step. During the step, the tree holds these directories:

- `base/`: a copy of the verified build, built again. Atesor compares each tune with this copy.
- `tune1/`, `tune2/` and so on: one copy of the patched tree for each tune.
- In each copy, `.atesor/` holds the compiler wrappers `cc` and `cxx`. A C or C++ build logs each compiler call to `.atesor/cc.log`.
- Work directories for the second check, the PGO profiles, the generated input files and the run outputs.

At the end of the step, Atesor copies the riscv64 artifacts of the accepted tune to `accepted/`, at their paths in the tree. Then it removes the other directories. When the tree is empty at the end, Atesor removes it. The verified build in `repos/<repo>/` never changes.

Where `accepted/` stays:

- On `qemu`, the sandbox mounts the workspace. The files stay in `<workspace>/repos/<repo>.opt/accepted/` on your computer.
- On `native`, the tree is on the machine. When the command ends, Atesor removes `/workspace/repos/<repo>.opt` from the machine.
- On `native` with `--package`, Atesor first copies the tree into the local mirror, `<state home>/workspace-native/repos/<repo>.opt/`. The zip holds the files in `optimized/`.

### The optimization record

The `optimization` key of the state file holds the result of the optimize step. Its main fields are:

| Field | Content |
|---|---|
| `status` | `accepted`, `no gain`, `not confirmed`, `not measured`, `checked` (on `qemu`), `skipped` or `error`. |
| `headline` | The answer in one line, for example `YES: ...` or `NO: ...`. The console summary shows it after `Optimized:`. |
| `reason`, `advice` | Why the step ended with this status, and a fix when Atesor has one. |
| `kind`, `machine_label`, `machine_check` | The target, the ISA label, and on `native` the result of the machine check. |
| `budget_seconds`, `duration_seconds` | The time limit and the time used, in seconds. |
| `language`, `package` | `c`, `go` or `rust`, and the package profile: `kind`, `libraries`, `programs` and more. |
| `baseline` | `build_seconds`, `same_code` and `artifacts` of the baseline copy. |
| `build_flags` | C and C++ only: `compiles`, `levels` and `lto` of the compiler calls of the baseline copy. |
| `workload` | The workload: `mode`, `command`, `description`, `origin`, and the source `files` of a harness. |
| `variants` | One record for each tune: `variant` (the settings), `verdict`, `reason`, `ratio`, `measurement` and `second_check`. |
| `accepted`, `accepted_label`, `accepted_title`, `accepted_ratio` | The accepted tune. `accepted` is `null` when no tune is accepted. |
| `accepted_dir`, `accepted_artifacts` | The sandbox path of `accepted/` and the files in it. |
| `warnings`, `notes` | Warnings and notes in plain language. |

A field that does not apply is missing or `null`. For example, a step that stops before the baseline build has no `baseline`.

### What is in the performance mode section of the report?

The report adds `## Machine Profile` with the facts of the probe and the settings that follow from them, in a code block. Then `## Performance Mode (--optimize)` has these items:

- `**Optimized**:` the headline. `**Result**:` the status and the reason. `**Fix**:` the advice, when there is one.
- `**Machine**:` the target, the ISA label, the core and the misaligned access speed.
- `**Package**:` the package type, the language, the build system, the libraries and the programs.
- `**Baseline**:` the build time of the baseline copy, and the number of riscv64 artifacts with the same code as the verified build.
- `**Workload**:`, `**Duration**:` and `**Optimized artifacts**:` when they apply.
- A table with one row for each tune. The columns are `Tune`, `Technique`, `Settings`, `Result`, `Time ratio (95% CI)` and `Details`.
- `### Warnings` and `### Notes`, with up to 30 items each.
- `### Workload source:` with the source file of a harness that the optimizer agent wrote.

The section ends with a note on the table. A time ratio below 1 means that the tune ran faster than the baseline. Only native runs measure time.

## What is in the zip package?

With `--package`, Atesor writes a zip after a port that ends with `SUCCESS`. This includes a build that is not verified.

The file name is `<owner>-<repo>-<YYYYMMDD-HHMMSS>-<platform>.zip`:

- `<owner>-<repo>` comes from the last two segments of the URL, in lower case. For example, `https://github.com/madler/zlib` gives `madler-zlib`.
- `<platform>` is the profile name: `alpine` or `debian`. The `ubuntu` platform uses the `debian` profile, so its zip name has `debian`.
- On the `native` target, the platform part ends in `-native`, for example `debian-native`.
- When the file name exists already, Atesor adds `.1`, `.2` and so on before `.zip`.

Atesor writes the zip as `<name>.zip.part` and renames it at the end. A run that stops during the write leaves no partial `.zip` file. The zip holds:

```text
build_recipe.md        copy of <repo>_recipe.md
manifest.json          metadata, see below
<repo>.log             batch log, when batch_test.py wrote one
agent_<repo>.log       agent log, when it exists
optimized/             the files of the accepted tune (--optimize only)
<repo>/                the source tree of the verified build
```

The source tree has no `.git` directories and no symbolic links. On the `native` target, Atesor copies the final tree from the machine before it writes the zip. With `--optimize`, it also copies the `<repo>.opt` tree when performance mode accepted a tune.

`optimized/` holds the riscv64 artifacts of the accepted tune, at their paths in the repository tree: `optimized/<path>` is the tune's build of `<repo>/<path>`. Atesor skips symbolic links and paths outside the accepted directory.

### `manifest.json` fields

| Field | Content |
|---|---|
| `schema_version` | `2`, or `3` with `--optimize` |
| `repo_name` | The repository name. |
| `repo_url` | The repository URL. |
| `package_stem` | The `<owner>-<repo>` part of the file name. |
| `legacy_package_stem` | The name stem that older releases used. |
| `platform` | The platform part of the file name, for example `debian-native`. |
| `created_at` | The local time, ISO 8601, in seconds. |
| `verification` | `status`, `verified`, `reason`, `source_commit`, `counts`, `abi_warnings`, `expected_missing`, `truncated` and `scan_error`. |
| `artifacts` | The riscv64 outputs that the artifact scan found. |
| `package_tests` | `status`, `framework`, `command`, `exit_code`, `duration_seconds` and `reason`. |
| `recipe_filename_in_zip` | `build_recipe.md` |
| `source_root_in_zip` | The repository name. |
| `logs_in_zip` | The names of the log files in the zip. |
| `machine` | Schema 3 only. `kind`, `emulated_cpu`, `label`, `extensions`, `vlen`, `core_name`, `misaligned`, `kernel` and `libc` from the machine probe. |
| `optimization` | Schema 3 only. The result of performance mode, see below. |

Each item in `artifacts` has `path`, `type`, `arch`, `abi`, `size` and `in_zip`. It can also have these fields:

- `role`, when the artifact curator gave the file a role, such as `primary`.
- `path_in_zip`, when the file is in the repository tree.
- `sha256`, when the file is a regular file in the zip.

An output that the build installed outside the repository tree, for example in `/usr/local/bin`, has `"in_zip": false`.

The `optimization` section of schema 3 has these fields:

| Field | Content |
|---|---|
| `status` | The status of performance mode, for example `accepted` or `no gain`. |
| `kind` | `native` or `qemu`. |
| `reason` | Why performance mode ended with this status. |
| `workload`, `workload_mode`, `workload_origin` | The description, the mode and the origin of the workload. |
| `accepted`, `accepted_label`, `accepted_ratio` | The ID, the console name and the time ratio of the accepted tune, or `null`. |
| `accepted_variant` | The full settings of the accepted tune, or `null`. |
| `artifacts` | One item for each file in `optimized/`, with `path_in_zip` and `sha256`. |
| `variants` | One item for each tune, with `vid`, `label`, `technique`, `verdict` and `ratio`. |

## What is in the logs?

### Agent log

`agent_<repo>.log` records all log messages of the run from level `DEBUG` up, also without `--verbose`. Each line has this form:

```text
HH:MM:SS [LEVEL] logger.name: message
```

Atesor appends to the file. A new run of the same repository adds to the same log.

### LLM call log

`agent-call_<repo>.log` records each LLM call of a port. Atesor appends one block for each call:

```text
CALL: call_<8 hex characters>
TIMESTAMP: <ISO 8601 time>
AGENT: <role>
MODEL: <model ID>
COST: $<cost in USD>
TOKENS: in=<input tokens> out=<output tokens>
METADATA: <JSON, when present>

--- PROMPT ---
<the first 10000 characters of the prompt>

--- RESPONSE ---
<the first 10000 characters of the response>
```

A line of 80 `=` characters comes before and after each block. When Atesor cuts the prompt or the response, it adds a line with the number of characters that it removed. The calls come from the agents through `src/llm_helpers.py`, from the summarizer and from the artifact curator. With `--optimize`, the optimizer agent adds calls with `AGENT: optimizer`. Their `METADATA` has a `phase` value that starts with `optimize-`.

`agent-call.log` is the file that Atesor creates with a header line `ATESOR AI - LLM CALL LOG` when it first loads the LLM logger. A port switches to `agent-call_<repo>.log` before the first call.

### Setup lock

`.container_setup.lock` is a lock file. Each sandbox setup locks it, so that parallel batch workers do not build the same image at the same time.

## What is in the cache files?

On the first load of `src/memory.py`, Atesor copies the bundled seed files into `<state home>/data/` when they are missing: `examples/*.json` and `recipe_cache.json`. Without a bundled cache, it writes an empty cache. After that, Atesor changes only the copies in `<state home>/data/`.

Atesor writes to these files only after a verified port. A build that is not verified, or a build that fails, does not change them. Each write holds a lock file next to the data file, for example `recipe_cache.json.lock`. Atesor writes a temporary file, then renames it. Performance mode also writes to `recipe_cache.json`, as the `optimizations` field below tells.

### `recipe_cache.json`

```json
{
  "version": "2.0",
  "packages": {
    "<repo>": {
      "<sandbox>": { "...": "one entry" }
    }
  }
}
```

The sandbox key is `<profile>-riscv64`, for example `alpine-riscv64` or `debian-riscv64`. On the `native` target, the key ends in `-native`. Each entry has these fields:

| Field | Content |
|---|---|
| `repo_url` | The repository URL. When it has a value, a cache hit needs a matching URL. |
| `build_system` | The build system of the plan. |
| `architecture` | `riscv64` |
| `sandbox` | The sandbox key. |
| `last_built` | The time of the build, ISO 8601. |
| `build_plan` | `phases`, each with `name` and `commands`. |
| `dependencies` | The system packages. |
| `patches` | Up to 10 applied patches. |
| `artifacts` | Up to 20 artifacts, each with `type`, `path` and an optional `role`. |
| `build_duration_seconds` | The duration of the run. |
| `recipe_file` | `output/<repo>_recipe.md` |
| `recipe_markdown` | The full recipe text, when the run made one. |
| `verification` | `status`, `reason` and `source_commit`. |
| `optimizations` | Results of performance mode, one for each machine. Present only after a measured run of `--optimize`. |

Atesor reads entries in an older flat format and moves each one under its sandbox key, with `alpine-riscv64` as the default key. Refer to [Recipe cache](/atesor/docs/guides/recipe-cache/).

The `optimizations` field follows these rules:

- Atesor adds a result only on the `native` target, only when the run had a workload, and only for the status `accepted` or `no gain`.
- Atesor adds a result only to an entry that exists already. Performance mode never creates an entry.
- The key is the core name from the machine probe, else the ISA label, else `unknown`. Results from different boards stay apart.
- Each result has `date`, `machine`, `status`, `accepted`, `ratio` and `workload`. An accepted tune adds `variant`: `label`, `technique`, `title`, `compiler`, `flags`, `env` and `pgo`.
- `variant` keeps only the settings that a later run can repeat. It drops the `-fprofile` flags and the `GOFLAGS` and `CCACHE_DISABLE` values, and keeps `pgo` as `true` or `false`.
- A new verified port of the package replaces the entry, and the old `optimizations` field with it. When that port runs with `--optimize`, Atesor adds the new result after the port.

### Few-shot example files

`<state home>/data/examples/` holds `scout_examples.json`, `fixer_examples.json`, `builder_examples.json` and `supervisor_examples.json`. After a verified port, Atesor adds learned examples:

- One scout example with the build plan.
- One builder example with the build phases.
- One fixer example for each fix that succeeded.

Each learned example gets an `id` such as `scout-auto-001`, `"source": "auto"`, a `timestamp` (`YYYY-MM-DD`) and a `sandbox` such as `debian-riscv64`. Atesor skips a duplicate example. Each file keeps up to 100 examples. When a file has more, Atesor removes the oldest learned examples first and keeps the manual ones. Refer to [Few-shot examples](/atesor/docs/contributing/few-shot-examples/).

## Which files does the native target add?

| File or directory | Location | Content |
|---|---|---|
| `ssh_config` | `$XDG_CACHE_HOME/atesor-ai/`, default `~/.cache/atesor-ai/` | The field-mode SSH settings, mode `0600`. Atesor writes it again on each run. |
| `cm-<process ID>-<hash>` | `$XDG_RUNTIME_DIR/atesor-ai/` when that directory exists, else the cache directory | The ssh control socket of one Atesor process. Atesor closes it when the command ends. |
| `repos/<repo>/` | `<state home>/workspace-native/` | The local mirror. rsync copies the tree from the machine for local reads. |
| work directory | `ATESOR_REMOTE_WORKDIR` on the machine, default `~/atesor-ai` | The container mounts it at `/workspace`. |

Atesor creates `repos`, `output`, `logs` and `patches` in the work directory on the machine. After each port, Atesor removes `/workspace/repos/<repo>` on the machine. The local mirror keeps its copy. With `--optimize`, Atesor also removes `/workspace/repos/<repo>.opt`. The local mirror has a copy of that tree only after `--package`. Refer to [Native RISC-V machine](/atesor/docs/guides/native-riscv/).

## Which other files can appear?

- `.ccache/`: `Dockerfile.debian` and `Dockerfile.native` set `CCACHE_DIR=/workspace/.ccache`. The compiler cache of the sandbox can write files there. On `qemu`, this is `<workspace>/.ccache/`. On `native`, it is in the work directory on the machine.
- `output/batch_logs/<repo>.log`: `batch_test.py` writes one log for each package, relative to its current directory. `--package` adds this file to the zip when it exists. Refer to [Batch runs](/atesor/docs/guides/batch-runs/).
