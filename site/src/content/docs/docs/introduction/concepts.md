---
title: Concepts
description: A glossary of the terms that the Atesor docs use, such as sandbox, target, recipe cache, verification, escalation, tune and workload.
sidebar:
  order: 3
---

This glossary defines the terms that the Eclipse Atesor™ docs use. Most terms are also names in the code, so you can search for them in the source and in the logs.

## Where builds run

### Sandbox

A sandbox is the riscv64 Linux container where Atesor clones and builds a package. On the QEMU target, it is a Docker container (`atesor-ai-sandbox` or `atesor-ai-sandbox-debian`) with the host workspace mounted at `/workspace`. On the native target, it is a rootless podman container on the riscv64 machine.

### Platform

A platform is the Linux distribution inside the sandbox. You select it with `--platform` or `ATESOR_PLATFORM`. The `alpine` platform uses musl, and the `debian` and `ubuntu` platforms share one profile with glibc. Each profile is a `PlatformProfile` in `src/platforms.py`, with its package manager and its map of package names.

### Target

A target is the place where builds run. You select it with `--target` or `ATESOR_TARGET`. The `qemu` target (the default) runs the sandbox on your computer under QEMU emulation. The `native` target runs it on a riscv64 machine over SSH and keeps its state in `workspace-native/`.

## How a port runs

### Scripted operations

Scripted operations are the deterministic steps in `src/scripted_ops.py`: the clone, the build system detection, the dependency extraction and the scan for architecture-specific code. They make no LLM call. The build report shows their number as "Scripted Operations".

### Agent and node

A node is one step of the LangGraph state graph in `src/graph.py`, for example `analyst_node` or `fix_node`. Each node has an agent role (`AgentRole`: planner, supervisor, scout, builder, fixer or summarizer). The `@agent_node` decorator gives each node the same error capture, rate-limit retry and audit log.

### AgentState

`AgentState` is the one dataclass in `src/state.py` that carries all data of a run from node to node. It holds the plan, the build status, the errors, the fixes, the cost and the verification verdict. Nodes change it in place. Atesor saves it as `<repo>_state_<timestamp>.json` when the graph finishes.

### Package analysis

The package analysis (`PackageAnalysis`) is the result of `analyst_node`, which reads the real build files and docs of the package. It gives the purpose, the build system, the dependencies, the RISC-V risks, the expected artifacts and the `needs_custom_plan` flag. The heuristic planner, the scout, the fixer and the verification step all use it.

### Recovery heuristic

A recovery heuristic is a repair in the builder that needs no LLM, for a known failure pattern. For example, the builder installs the distro package for a missing header. It builds again on one thread after a suspected out-of-memory kill (exit 137). It adds `-mcmodel=medany` after a RISC-V relocation error. The builder tries a heuristic before the fixer gets the error.

### Escalation

Escalation is the end of a run that cannot finish. The supervisor escalates in these cases:

- The run reaches the attempt limit.
- The last three errors have the same signature (an error loop).
- The last error is a permission error or a disk space error.
- The LLM cost goes above the cost cap.
- A node crashes.

`escalate_node` writes a report for a person, and Atesor exits with code 1.

### Cost cap

The cost cap stops a port when its LLM cost is more than $1.00. Atesor prices each call from the token usage that the provider reports (`cost_for_usage` in `src/models.py`). Free OpenRouter models count as $0. The supervisor applies the cap, so the cap does not stop the optimizer agent of performance mode, which runs after the port.

## What a port produces

### Verification

Verification is the ELF check in `verify_node`. A program in the sandbox reads the ELF header of every build output and of every member of every static archive. The verdict is one of these:

- `verified`: riscv64 ELF64 outputs, and no output for another architecture. Exit code 0.
- `wrong_arch`: one output or more for another architecture, such as x86-64, aarch64 or riscv32. The port fails, and the fixer gets an `ARCHITECTURE` error.
- `unverified`: Atesor cannot prove a riscv64 output, for example for a header-only library. Exit code 3.

### Artifact

An artifact is a file that the build produced: an executable, a shared library or a static archive. Atesor records the riscv64 artifacts in the state, and the artifact curator ranks them as primary or secondary for the recipe. With `--package`, the zip manifest lists each one, with a SHA-256 for each file inside the zip.

### Recipe

The recipe is the Markdown file `<repo>_recipe.md` that the summarizer writes at the end of a successful run. The prompt asks for six sections, from the prerequisites to the commands that check the binaries. A person or a CI job can use it to do the build again.

### Recipe cache

The recipe cache is the file `recipe_cache.json` in the data folder. It holds one entry for each package and sandbox key, for example `alpine-riscv64` or `debian-riscv64-native`. On a cache hit, Atesor writes the recipe file from the entry and does not build. Atesor adds an entry only for a verified port. A measured performance mode result from the native target goes into the entry, under `optimizations`.

### Few-shot memory

Few-shot memory is the set of example files in `data/examples/`, one file for each agent role. A verified port adds examples with `source: "auto"`, up to 100 for each agent. The scout and fixer prompts show the examples that match the build system and the sandbox, found by keywords and regular expressions.

## How performance mode runs

### Performance mode

Performance mode is the optional stage that `--optimize` adds after a verified port, in `optimize_node`. It builds tunes of the port for the machine, checks them, and measures them on the native target. The verified build always stays the result of the port.

### Machine probe

The machine probe is a sandbox program that reads the ISA extensions, the core, the misaligned access speed, the CPUs and the compilers. Test instructions decide which extensions are present (`src/machine.py`). `--probe` runs only the probe and saves the result as `machine_profile_<native|qemu>.json`.

### Tune

A tune is one optimized build of the package: the same build commands with other compiler or toolchain settings (`Variant` in `src/optimize.py`). Examples are core tuning (`-mtune`), machine ISA (`-march`), `-O3`, link-time optimization, clang, `GORISCV64` for Go, and PGO. Each tune builds in its own copy of the patched tree, `<repo>.opt/<id>`.

### Baseline

The baseline is a copy of the verified build that Atesor builds again in `<repo>.opt/base`, in the same way as each tune. Atesor compares each tune with this copy, so only the change of the tune counts.

### Workload

The workload is the run that Atesor times. It must do the same fixed work in each run (`src/workload.py`). Atesor tries the sources that fit the package type, in this order:

1. The Go benchmarks of a Go module.
2. A run of a program of the package.
3. A harness for a library.
4. A test or example program of the package that calls its library.
5. The package tests.

### Optimizer agent

The optimizer agent is the LLM step of performance mode. It proposes a program run, or writes a harness: a small driver program against the public API of a library. It uses the model of the `builder` role for a harness and the model of the `planner` role for a program run.

### PGO

PGO (profile-guided optimization) is the last tune, for C/C++ and Go only. For C/C++, Atesor builds the best tune with profile instrumentation, runs the workload to record a profile, and builds again with that profile. For Go, Atesor records a CPU profile from the Go benchmarks of the workload.

### Gates

The gates are the correctness checks of each tune:

- The artifacts must be riscv64 code that the settings of the tune built.
- The package tests must still pass.
- The workload output must be the same as the baseline output.

### Measurement

On the native target only, the measurement times the baseline and a tune in rounds, pinned to one CPU (`src/bench.py`). Each round runs the two builds in random order. A tune is faster when the upper bound of the 95% interval of its time ratio is below 0.98 and p < 0.05.

### Accepted tune

An accepted tune is a tune that the measurement found faster and that won again in a second check. Atesor copies its riscv64 artifacts to `<repo>.opt/accepted`. Under QEMU, Atesor never accepts a tune.

## Related pages

- [How it works](/atesor/docs/introduction/how-it-works/): these terms in the order of a run.
- [Agent state](/atesor/docs/architecture/agent-state/): every field of `AgentState`.
- [Verification](/atesor/docs/architecture/verification/): the full rules of the ELF check.
- [Performance mode](/atesor/docs/guides/optimize/): how to use `--optimize` and `--probe`.
