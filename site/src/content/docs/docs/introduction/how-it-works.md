---
title: How it works
description: The path from a repository URL to a verified riscv64 build and a recipe, the optional performance mode, and why Atesor runs scripts before an LLM call.
sidebar:
  order: 2
---

Eclipse Atesor™ takes a repository URL and runs a fixed sequence: a cache check, a sandbox start, a graph of agents, and the output files. Scripts do each step that a script can do. Atesor makes an LLM call only where a step needs judgment. Two examples are a build plan for an unusual project and a fix for a new error.

This page gives the concept. [Architecture overview](/atesor/docs/architecture/overview/) gives the detail.

## What happens when you start a port?

You start a port with a command such as `python3 main.py --repo https://github.com/madler/zlib`. Then `main.py` does these steps:

1. **Check the input.** Atesor accepts only a plain `http` or `https` URL without shell metacharacters. It takes the package name from the URL, for example `zlib`.
2. **Look in the recipe cache.** If the cache has a recipe for this package, this sandbox and this URL, Atesor writes the recipe file and stops. This step needs no API key and no Docker. The `--force` flag skips the cache. The `--optimize` flag also skips this step, because performance mode needs a real build tree.
3. **Check the API key.** Atesor reads `LLM_PROVIDER` and stops if the key for that provider is not set.
4. **Start the sandbox.** Atesor checks that the host can run riscv64 code through binfmt_misc. It builds the sandbox image if the image does not exist, starts the container, and checks that the container reports `riscv64`.
5. **Run the agent graph.** A LangGraph state machine runs the nodes in the next section. One `AgentState` object carries all data of the run from node to node.
6. **Write the outputs.** Atesor writes the state snapshot, the build report, the recipe and the patches. With `--package`, it also writes a zip file.

## How does the graph go from source code to recipe?

The graph is in `src/graph.py`. The arrows show the usual path.

```text
init_node             clone + scripted analysis                (no LLM)
   |
   +--> cached_recipe_node   cached build plan, --optimize only    (no LLM)
   |                         then to supervisor_node
   |
analyst_node          read the build files, write an analysis  (LLM)
   |
heuristic_plan_node   default build plan                       (no LLM)
   |        \
   |         scout_node   LLM build plan, only when needed
   |        /
supervisor_node       route by rules                           (no LLM)
   |
   +--> build_fix_subgraph:  build_node -> verify_node -> fix_node -> build_node
   +--> scout_node           new plan after some failures
   +--> finish_node          package tests, recipe, learning
   |       |
   |       +--> optimize_node   performance mode, --optimize only
   +--> escalate_node        report for a person
```

1. `init_node` clones the repository inside the sandbox. It then runs a scripted analysis: build system detection, dependency extraction, and a scan for architecture-specific code.
   - With `--optimize`, if the recipe cache has a verified recipe of the package, `init_node` sends the run to `cached_recipe_node`. This node makes the cached build plan the plan of the run and applies the cached patches. The analyst and the scout make no LLM call. If the cached recipe has no command, the run goes to `analyst_node`. `--force` makes Atesor plan again.
2. `analyst_node` reads excerpts of the real build files and docs. It writes a package analysis: the purpose, the build system, the dependencies, the RISC-V risks and the expected artifacts. It also sets `needs_custom_plan` when a standard recipe will not work.
3. `heuristic_plan_node` writes a default build plan for CMake, Make, autotools and Go. It sends the work to `scout_node` in these cases:
   - The analyst set `needs_custom_plan`.
   - The confidence in the build system is less than 0.5.
   - The scan found one critical, or three or more high, architecture-specific findings.
   - The build system has no default plan, for example Meson or Cargo.
4. `scout_node` asks the LLM for a build plan, based on the analysis and the build files. When it plans again after a failure, it also sees the error.
5. `supervisor_node` chooses the next node with rules only. A `SUCCESS` status always goes to `finish_node`. A failure with a `DEPENDENCY` or `MISSING_TOOLS` error goes back to the scout for a new plan. A known plan error, such as a missing `./configure` script, also goes back to the scout, one time for each error type. Other failures go back into the build-fix loop.
6. Inside `build_fix_subgraph`, `build_node` runs the phases of the plan. When a command fails, it first tries its recovery heuristics. `verify_node` reads the ELF header of each build output. `fix_node` asks the LLM for a fix, applies it, and sends the run back to `build_node`.
7. `finish_node` runs the package's own tests one time. It then asks the LLM to write the recipe. When the port is verified, it saves the recipe in the recipe cache and adds few-shot examples.
8. `optimize_node` runs after `finish_node` only with `--optimize`. The next section describes it.
9. `escalate_node` writes a report for a person when the run cannot finish.

## What happens after a verified port with `--optimize`?

Performance mode is an optional stage after the port. It tries faster builds of a verified port for the machine that runs Atesor. Each build that it tries is a tune: the same build with other compiler or toolchain settings. The verified build always stays the result of the port. A faster tune is an extra output.

1. **Probe the machine.** Atesor reads the ISA extensions, the core, the CPUs and the compilers of the machine.
2. **Build a baseline.** Atesor builds the verified build again in a copy. It compares each tune with this copy.
3. **Select a workload.** The workload is a run that does the same fixed work each time, for example the benchmarks of a Go module. For programs and libraries, the optimizer agent (an LLM) proposes a program run or writes a small harness.
4. **Build the tunes.** Examples are `-march` with the probed extensions, `-O3`, LTO, clang and PGO (profile-guided optimization).
5. **Check each tune.** Each tune must make riscv64 artifacts with its settings. The package tests must still pass, and the workload output must be the same as the baseline output.
6. **Measure each tune.** Only on the native target, Atesor times each tune against the baseline. A faster tune must win again in a second check. Under QEMU, Atesor checks the tunes but makes no speed claim.

For a port that is not verified, performance mode stops with the status `skipped`. It never changes the exit code of the port. [Performance mode](/atesor/docs/guides/optimize/) tells how to use it. [Performance mode internals](/atesor/docs/architecture/optimize/) gives the design.

## What does "deterministic first" mean?

Deterministic first is the first design rule of Atesor: do not spend an LLM call on work that a script can do. A deterministic step gives the same result for the same input. The rule shows in each part of the pipeline:

- **Analysis.** The clone, the build system detection, the dependency extraction and the architecture scan are scripts in `src/scripted_ops.py`.
- **Planning.** For a known build system, the default plan comes from code. The LLM scout runs only when the default plan cannot work.
- **Routing.** The supervisor uses rules. It makes no LLM call.
- **Repair.** The builder tries its recovery heuristics before the fixer gets the error. For example, it installs the distro package for a missing header, or it builds again on one thread after a suspected out-of-memory kill under QEMU.
- **Verification.** A script reads the ELF headers. No LLM decides if a binary is riscv64 code.
- **Performance mode.** Scripts probe the machine, build the tunes, check them and time them. The LLM only proposes a workload. Statistics, not an LLM, decide if a tune is faster.
- **LLM answers.** Each answer must pass a schema check. When an answer is not valid after the retries, a deterministic fallback takes its place where one exists.

## Where does Atesor use an LLM?

An LLM call happens only at these points:

| Step | When | Fallback if the LLM fails |
|---|---|---|
| Analyst | Once at the start of the run, but not in a run from a cached recipe | An analysis from the scripted detection |
| Scout | No default plan, or a new plan after a dependency, tool or plan error | A fallback build plan |
| Fixer | After a build or verification failure | None. The run fails or escalates. |
| Summarizer | Once at the end of a successful run | A short recipe from the build steps |
| Artifact curator | Once at the end, to rank the build outputs | Rule-based ranking |
| Optimizer | Only with `--optimize`, after a verified port: a program run or a harness for the workload | The next workload source. The package tests are the last source. |

Before the fixer proposes a fix, it can ask for one round of read-only commands, such as `cat` or `readelf`. The round has a limit of 4 commands.

Atesor writes each call to the LLM call log, with its tokens and its cost. The cost cap stops a port at $1.00 of LLM cost. The supervisor applies the cap, so the cap does not stop the optimizer, which runs after the port. See [Cost control](/atesor/docs/guides/cost-control/).

## How does a run end?

A run stops at the first of these conditions:

- The build succeeds. Atesor goes to `finish_node`, also when the success comes on the last attempt.
- The run reaches the attempt limit, 5 by default (`--max-attempts`).
- The last three errors have the same signature (an error loop).
- The last error is a permission error or a disk space error.
- The LLM cost is more than $1.00.

Every stop except a success goes to `escalate_node`, and the command exits with code 1. A success exits with code 0 when verification proves riscv64 output, or with code 3 when it does not. With `--optimize`, performance mode runs after a success and does not change the exit code.

## Next steps

- [Concepts](/atesor/docs/introduction/concepts/): the terms on this page.
- [Your first port](/atesor/docs/getting-started/first-port/): see the flow on a real package.
- [Architecture overview](/atesor/docs/architecture/overview/): the nodes, the routing functions and the state.
