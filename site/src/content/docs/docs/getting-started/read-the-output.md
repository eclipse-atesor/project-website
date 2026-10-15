---
title: Read the output
description: The files that an Atesor run writes (recipe, report, state snapshot, patches, zip package and logs), where they are, and which one to open first.
sidebar:
  order: 5
---

Each Eclipse Atesor™ run writes a set of files: a recipe, a build report, a state snapshot, patches, logs and, on request, a zip package. This page tells where each file is, what it contains, and which file to open first for each result.

## Where are the output files?

Atesor writes to a workspace folder and a data folder:

| Install | Workspace folder | Data folder |
|---|---|---|
| Source checkout | `workspace/` in the checkout | `data/` in the checkout |
| `.deb` package | `~/.local/share/atesor-ai/workspace/` | `~/.local/share/atesor-ai/data/` |
| `ATESOR_HOME` set | `$ATESOR_HOME/workspace/` | `$ATESOR_HOME/data/` |

When `XDG_DATA_HOME` is set, the `.deb` package uses `$XDG_DATA_HOME/atesor-ai/` in place of `~/.local/share/atesor-ai/`. On the native target, the workspace folder is `workspace-native/` in place of `workspace/`.

| File | Folder | Written when |
|---|---|---|
| `<repo>_recipe.md` | `workspace/output/` | A run ends with `SUCCESS`, or a cache hit |
| `<repo>_report_<YYYYMMDD_HHMMSS>.md` | `workspace/output/` | The agent graph finishes, with any result |
| `<repo>_state_<YYYYMMDD_HHMMSS>.json` | `workspace/output/` | The agent graph finishes, with any result |
| `<repo>_patches_<YYYYMMDD_HHMMSS>/` | `workspace/output/` | The run applied one patch or more |
| `<owner>-<repo>-<YYYYMMDD-HHMMSS>-<platform>.zip` | `workspace/packages/` | `--package` and a `SUCCESS` result |
| `<repo>.opt/accepted/` | `repos/` in the work directory of the native machine | `--optimize` and an accepted tune |
| `machine_profile_<target>.json` | `workspace/output/` | A `--probe` run |
| `agent_<repo>.log` | `workspace/logs/` | Each run with `--repo` |
| `agent-call_<repo>.log` | `workspace/logs/` | Each LLM call |
| `recipe_cache.json` | data folder | A verified port |
| `examples/*.json` | data folder | A verified port |

`<repo>` is the package name that Atesor takes from the URL, for example `zlib`. `<target>` is `native` or `qemu`.

Atesor accepts a tune only on the native target. There, the `<repo>.opt` folder is on the machine, and Atesor removes it at the end of the run. With `--package`, Atesor first copies the accepted artifacts into the zip, under `optimized/`.

## Which file should I open first?

| Result | Exit code | Open first | Then |
|---|---|---|---|
| Verified port | 0 | The recipe | The "Artifact Verification" section of the report |
| Not verified | 3 | The "Artifact Verification" section of the report, and its reason | The "Recommendations" section |
| Failure or escalation | 1 | The "Error Resolution History" section of the report | `context_cache.escalation_report` in the state snapshot, then `agent_<repo>.log`, then `agent-call_<repo>.log` |
| Packaging failure | 2 | `agent_<repo>.log`, at the `Packaging failed` line | The build succeeded. Only the zip step failed. |
| Performance mode result | The same as the port | The `Performance Mode (--optimize)` section of the report | `optimized/` in the zip, with `--package` |

## What is in the recipe?

The recipe, `<repo>_recipe.md`, is the guide to build the package again on riscv64. The summarizer LLM writes it at the end of a successful run, from the build steps, the fixes and the verification verdict. The prompt asks the LLM for these sections, in this order:

1. `## Executive Summary`: the status and a short verdict on portability.
2. `## Prerequisites`: the package install commands for the sandbox distribution.
3. `## Build Instructions`: the build commands, one code block for each step.
4. `## Architecture Notes`: the architecture-specific changes that the package needed.
5. `## Verification`: how to check that the binaries are riscv64, with `file` or `readelf -h`.
6. `## Known Issues & Recommendations`: remaining problems and ideas to send upstream.

If the summarizer call fails, Atesor writes a short recipe with the build steps and the verification verdict.

The file name has no time stamp. A new successful run or a cache hit writes a new recipe file in its place. On a cache hit, Atesor writes the stored recipe text. For an old cache entry without stored text, it writes a recipe from the cache fields, with a note to run again with `--force`.

## What is in the report?

The report, `<repo>_report_<YYYYMMDD_HHMMSS>.md`, has these sections. Atesor leaves out the architecture, patch and error sections when they have no data. The two performance mode sections appear only with `--optimize`.

| Section | Content |
|---|---|
| Executive Summary | The status, the target (`qemu` or `native`), the repository and the time |
| Metrics | The duration, the attempts, the API calls, the scripted operations, the LLM tokens and the cost |
| Artifact Verification | The verdict, its reason, the source commit, the counts, and up to 20 files of each kind |
| Package Tests (not gating) | The result, the command, the exit code, the duration and the output tail |
| Machine Profile | The result of the machine probe |
| `Performance Mode (--optimize)` | The `Optimized` answer (`YES`, `NO`, or `NOT TIMED` under QEMU), the reason, the machine, the package, the baseline, the workload, one row for each tune, and the workload source code |
| Build System Analysis | The build system, the build phases with their commands, and the dependencies |
| Architecture-Specific Code | The first 5 findings of the architecture scan |
| Patches Applied | Each patch, cut at 500 characters |
| Error Resolution History | Each error, with its category |
| Recommendations | The next steps for this result |

The status of a successful run is `SUCCESS (riscv64 output verified)` or `SUCCESS, NOT VERIFIED (no riscv64 output proven)`. The counts table of the verification has three columns: riscv64 outputs, outputs for another architecture, and committed files for another architecture. Committed files never decide the verdict.

## What is in the state snapshot?

The state snapshot, `<repo>_state_<YYYYMMDD_HHMMSS>.json`, is the full `AgentState` of the run. Start with these fields:

| Field | Content |
|---|---|
| `build_status` | `SUCCESS`, `FAILED` or `ESCALATED` at the end of a run |
| `artifact_verification` | The verdict (`verified`, `wrong_arch` or `unverified`), the reason and the evidence |
| `package_tests` | The result of the package's own tests |
| `error_history` | Each error, with its category, severity, command and message |
| `fixes_attempted` | Each fix, with its strategy, its changes and its success |
| `build_plan` | The build plan with its phases and commands |
| `package_analysis` | The analysis from `analyst_node` |
| `context_cache.escalation_report` | The escalation report, after an escalation |
| `api_cost_usd`, `api_tokens_in`, `api_tokens_out` | The LLM cost and the tokens |
| `audit_trail` | The events of each agent, in order |
| `optimization` | The performance mode result, with one record for each tune. Only with `--optimize`. |
| `machine_profile` | The machine probe. Only with `--optimize`. |

## What is in the patches folder?

The folder `<repo>_patches_<YYYYMMDD_HHMMSS>/` holds one file for each patch that the fixer applied: `patch_1.patch`, `patch_2.patch` and so on. In a run from a cached recipe (`--optimize`), it also holds each cached patch that applied. It holds only patch actions. Commands that the fixer ran and files that it created are in `fixes_attempted` in the state snapshot, as `Executed: <command>` and `Created file: <path>` lines.

## What is in the zip package?

With `--package`, a successful run writes a zip file to `workspace/packages/`. The name is `<owner>-<repo>-<YYYYMMDD-HHMMSS>-<platform>.zip` in lower case, for example `madler-zlib-<YYYYMMDD-HHMMSS>-alpine.zip`. The platform is `alpine` or `debian`, also for `--platform ubuntu`. On the native target, the name ends in `-native.zip`.

| Entry | Content |
|---|---|
| `build_recipe.md` | The recipe |
| `manifest.json` | The metadata of the package: schema version 2, or 3 with `--optimize` |
| `agent_<repo>.log` | The debug log, if present |
| `<repo>.log` | The batch log, only in a batch run |
| `optimized/` | The riscv64 artifacts of the accepted tune, only with `--optimize` and an accepted tune |
| `<repo>/` | The source tree with the build outputs, without `.git` and without symbolic links |

The main keys of the manifest are:

- `verification`: the status, the reason, the source commit, the counts and the ABI warnings.
- `artifacts`: each verified riscv64 output, with its type, architecture and size. An output inside the zipped tree also has its SHA-256 and `in_zip: true`. An output installed outside the tree, such as in `/usr/local/bin`, has `in_zip: false`.
- `package_tests`: the status, the framework, the command, the exit code and the duration.
- `repo_url`, `platform`, `created_at` and the names of the files in the zip.
- `machine` and `optimization`, only in schema version 3: the machine probe, the performance mode result, each tune with its verdict, and a SHA-256 for each file in `optimized/`.

## What is in the debug log?

`agent_<repo>.log` has every log line of the run at the `DEBUG` level, with the time, the level and the module name. It shows each command, each routing decision and each recovery heuristic. After an escalation, it also contains the escalation report. Without `--verbose`, the console shows only errors from this log.

## What is in the LLM call log?

`agent-call_<repo>.log` has one entry for each LLM response, also for each retry after an answer that was not valid. A call that fails with an error has no entry in this log. The debug log records it. Each entry has these lines:

```text
CALL: call_<id>
TIMESTAMP: <time>
AGENT: <role>
MODEL: <model>
COST: $<cost>
TOKENS: in=<input tokens> out=<output tokens>
METADATA: <JSON>
--- PROMPT ---
<the first 10000 characters of the prompt>
--- RESPONSE ---
<the first 10000 characters of the response>
```

Use this log to see what an agent received and what it answered. A call with `TOKENS: in=0 out=0` means that the provider reported no usage, so the cost of that call is unknown.

## Related pages

- [Output files](/atesor/docs/reference/output-files/): the full reference of every file and field.
- [Exit codes](/atesor/docs/reference/exit-codes/): each code and its meaning.
- [Troubleshooting](/atesor/docs/guides/troubleshooting/): what to do after a failure.
