---
title: Your first port
description: Port zlib to riscv64 with Atesor. The command to run, what Atesor does at each stage, and where it writes the recipe, the report and the logs.
sidebar:
  order: 4
---

This page shows a full port of zlib, a small C compression library, with Eclipse Atesor™. You run one command, follow the stages of the run, and then find the output files.

## Before you start

1. [Install Atesor](/atesor/docs/getting-started/install/).
2. [Set the LLM provider and its API key](/atesor/docs/getting-started/configure-llm/).
3. Build the Alpine sandbox one time:

   ```bash
   python3 main.py --setup-only
   ```

The commands on this page use a source checkout. With the `.deb` package, write `atesor-ai` in place of `python3 main.py`.

## Why does the first port need `--force`?

The recipe cache that comes with Atesor (`data/recipe_cache.json`) already has zlib entries for the `alpine-riscv64` and `debian-riscv64` sandboxes. These entries are older than the verification step, so they have no verdict.

Without `--force`, Atesor finds the entry, writes the recipe file, prints `CACHED (not rebuilt), NOT VERIFIED` and exits with code 3. It builds nothing. To see the full pipeline and get a verified result, add `--force`.

## How do I run the port?

Run this command from the root of your checkout:

```bash
python3 main.py --repo https://github.com/madler/zlib --force --verbose
```

| Flag | Effect |
|---|---|
| `--repo` | The repository to port |
| `--force` | Skip the recipe cache and run the full pipeline |
| `--verbose` | Show the agent activity and the debug log on the console |

You can add these flags:

| Flag | Effect |
|---|---|
| `--package` | On success, also write a zip file with the recipe, the source tree and a manifest |
| `--platform debian` | Use the Debian/Ubuntu sandbox. Build it first with `--setup-only --platform debian`. |
| `--max-attempts N` | Allow `N` fix attempts before escalation. The default is 5. |
| `--optimize` | After a verified port, try faster builds for this machine. See [Performance mode](/atesor/docs/guides/optimize/). |

## What does Atesor do at each stage?

1. **Input check.** Atesor checks the URL and takes the package name `zlib` from it. It sets the debug log to `agent_zlib.log` and the LLM call log to `agent-call_zlib.log`.
2. **Cache.** `--force` makes Atesor skip the recipe cache.
3. **Key check.** Atesor checks the key of your provider. Then it prints the provider and the models.
4. **Sandbox.** Atesor checks the riscv64 handler, starts the Alpine container, and checks that it reports `riscv64`.
5. **Agent graph.** Atesor prints `Starting RISC-V Porting Agent`, the repository, the attempt limit and the platform. For each node of the graph, it prints a `[Step N]` line with the node name and a `Status:` line.
6. **`init_node`.** Atesor clones zlib into `/workspace/repos/zlib` inside the container. On the host, this is `repos/zlib` in your workspace folder. Then the scripted analysis detects the build system, the dependencies and any architecture-specific code.
7. **`analyst_node`.** The LLM reads excerpts of the zlib build files and docs and writes the package analysis. The status is `PLANNING`.
8. **`heuristic_plan_node` or `scout_node`.** For a known build system, Atesor writes a default build plan without an LLM. If no default plan fits, for example because the analysis asks for a custom plan, the scout asks the LLM for a plan. The status of the scout is `SCOUTING`.
9. **Build-fix loop.** The builder runs the phases of the plan, with the status `BUILDING`. When a command fails, the builder tries its recovery heuristics, and then the fixer asks the LLM for a fix (`FIXING`). After the build commands pass, `verify_node` reads the ELF header of each output.
10. **`finish_node`.** Atesor runs the zlib test suite one time, if it finds one. It then asks the LLM to write the recipe. When the port is verified, it saves the recipe in the recipe cache and adds few-shot examples. With `--optimize`, an `optimize_node` step with the status `OPTIMIZING` comes next.
11. **Outputs.** Atesor saves the output files and prints the path of each one. Then it prints the result line. With `--optimize`, the summary after a success also has an `Optimized:` line.

| Result line | Exit code |
|---|---|
| `PORTING SUCCESSFUL! (riscv64 output verified)` | 0 |
| `PORTING FINISHED, NOT VERIFIED` | 3 |
| `PORTING STOPPED / FAILED` | 1 |
| `Packaging FAILED: <error>` (only with `--package`) | 2 |

After a failure, Atesor also prints `Last Error Capture:`, with the category and severity of the last error. It then prints `Agent Decision Audit:`, with the last 10 events of the run.

## Where do the outputs go?

| Install | Workspace folder |
|---|---|
| Source checkout | `workspace/` in the checkout |
| `.deb` package | `~/.local/share/atesor-ai/workspace/` |
| `ATESOR_HOME` set | `$ATESOR_HOME/workspace/` |

For this port, Atesor writes these files in the workspace folder:

```text
output/zlib_recipe.md
output/zlib_report_<YYYYMMDD_HHMMSS>.md
output/zlib_state_<YYYYMMDD_HHMMSS>.json
output/zlib_patches_<YYYYMMDD_HHMMSS>/patch_<N>.patch     (only if the run applied a patch)
logs/agent_zlib.log
logs/agent-call_zlib.log
packages/madler-zlib-<YYYYMMDD-HHMMSS>-alpine.zip         (only with --package)
repos/zlib/                                               (the build tree)
```

[Read the output](/atesor/docs/getting-started/read-the-output/) explains each file and what to look at first.

## What happens when I run it again?

After a verified port, run the command without `--force`:

```bash
python3 main.py --repo https://github.com/madler/zlib
```

Atesor finds the new cache entry and prints `CACHED (not rebuilt): recipe for 'zlib' from an earlier verified run`. It writes `zlib_recipe.md` again and exits with code 0. A cache hit needs no API key and no Docker. It also writes no zip file, even with `--package`.

:::note
In a source checkout, a verified port writes to `data/recipe_cache.json` and to the files in `data/examples/` of your clone. `git status` shows these changes.
:::

## Next step

[Read the output](/atesor/docs/getting-started/read-the-output/).
