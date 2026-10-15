---
title: Performance mode internals
description: "How --optimize works inside: the optimize_node hook, the machine probe, the baseline tree, workloads, tunes, PGO, the gates and the timing protocol."
sidebar:
  order: 7
---

Eclipse Atesor™ performance mode (`--optimize`) builds tuned copies of a verified port, checks them, and times them against the verified build on native riscv64 hardware. The code is in `src/optimize.py`, `src/machine.py`, `src/workload.py` and `src/bench.py`. Read this page before you change how Atesor builds, checks, measures or accepts a tune. For the user steps, see [Performance mode](/atesor/docs/guides/optimize/).

This page uses these terms:

- A **tune** is the verified build with other compiler or toolchain settings. The console calls them `Tune-1`, `Tune-2` and so on.
- The **baseline tree** is a copy of the verified build, rebuilt the same way as each tune. Atesor compares each tune with it.
- A **gate** is a check that a tune must pass before Atesor times it.
- A **workload** is a command that does the same, fixed amount of work in every run, so its run time shows the speed of the build.

## Where does performance mode hook into a run?

Performance mode adds 2 nodes to the parent graph, `cached_recipe_node` and `optimize_node`. It works in these steps:

1. `main.py` sets `optimize_requested` in the initial state. `--optimize` skips the recipe cache fast path, because performance mode needs a real build tree.
2. Without `--force`, `main.py` reads the recipe cache. A verified entry goes into `state.cached_recipe`, and `cached_recipe_node` turns it into the build plan with no planning LLM call.
3. The port runs as usual. After `finish_node`, `route_finish_to_next` sends the run to `optimize_node`.
4. `optimize_node` calls `run_optimization()` in `src/optimize.py`. It passes the optimizer agent and a function that runs the detected package test command in a given tree.
5. `optimize_node` writes the result to `state.optimization`. It then calls `record_optimization()`, which stores a native measured result in the recipe cache.

`optimize_node` catches every exception itself. An error becomes `state.optimization` with the status `error`, and the port keeps its result and its exit code. `run_optimization()` stops at once with the status `skipped` when the verdict of the port is not `verified`. The [architecture overview](/atesor/docs/architecture/overview/) shows both nodes in the graph.

## What does the pipeline look like?

```text
finish_node (SUCCESS)
  |  route_finish_to_next: optimize_requested
  v
optimize_node --> run_optimization()
  |
  |-- verdict is not verified ----------------------------> skipped
  |
  1. probe_machine()          src/machine.py      no LLM
  2. check_integrity()        native only         no LLM
  |    a CPU gives wrong data ----------------------------> not measured
  3. profile_package()        src/workload.py     no LLM
  4. replay_commands(), build_ladder()            no LLM
  |    no tune, no command or no artifact ----------------> skipped
  5. baseline tree <repo>.opt/base, gate 1        no LLM
  |    the baseline does not build -----------------------> error
  6. choose_workload()        src/workload.py     LLM for a program
  |                                               run or a harness
  |    no workload on native -----------------------------> not measured
  7. for each tune, Tune-1 to Tune-6:
  |      build in <repo>.opt/<id>
  |      gate 1 --> gate 2 --> gate 3
  |      bench.measure()      native only         no LLM
  8. PGO tune on top of the best tune             no LLM
  9. second check of the fastest tune, then the next one
  10. copy the accepted artifacts to <repo>.opt/accepted,
      remove every other tree
  v
state.optimization["status"]:
  accepted | no gain | not confirmed | not measured
  checked (QEMU) | skipped | error
```

## What does the machine probe read?

`probe_machine()` runs one Python program in the sandbox, with a limit of 600 seconds. The program prints raw facts as one JSON document. `evaluate_probe()` on the host turns the facts into a `MachineProfile`. The probe reads these facts:

- **ISA extensions** from 3 sources: `/proc/cpuinfo`, the `riscv_hwprobe` system call (Linux 6.4 or later), and test instructions. A test instruction runs in a child process for `zba`, `zbb`, `zbs`, `zicond`, `zfa`, `zfhmin` and `v`. A child that stops with SIGILL marks the extension as absent. The test instructions win over the other 2 sources.
- **The core**, from the device-tree `compatible` string, the `uarch` line of `/proc/cpuinfo`, or `mvendorid` and `marchid` together. The core table in `src/machine.py` has 5 entries: `sifive-u74`, `sifive-p550`, `spacemit-x60`, `thead-c906` and `thead-c910`. Atesor matches a core on the native target only.
- **Misaligned access speed**, from `riscv_hwprobe`. When `riscv_hwprobe` gives no answer on the native target, a load-timing test decides. A misaligned 8-byte load that costs at most 4 aligned loads is `fast`. A load that costs 40 or more is `emulated`, and a load between the two is `slow`. A test that stops with SIGBUS gives `unsupported`.
- **Compilers**: `gcc`, `clang` and `clang-19` to `clang-22`, when they are installed. For each compiler, the probe records the `-march` extensions and `-mtune` names that it accepts. It also tests `-mstrict-align`, `-flto=auto` and `-ffat-lto-objects`, and whether the compiler really emits Zba and Zbb instructions.
- **Go and Rust**: the Go version, the `rustc` version, the target CPUs of `rustc` and their target features.
- **The board**: the allowed CPUs, the memory, the kernel, the libc, the cpufreq governor and frequency, the temperatures and the caches.

Under QEMU with no named CPU model, the extension set is the QEMU `max` CPU, which matches no real board. Atesor then builds no ISA tune. `--emulate-cpu` (or `ATESOR_QEMU_CPU`) names a model. Atesor passes it as `QEMU_CPU` to the probe, the builds and the runs. `--probe` runs the same probe alone and writes `machine_profile_<kind>.json` to the output directory.

## How does the machine check work?

On the native target, `check_integrity()` runs after the probe and before any build. It does these steps:

1. It starts one child process for each allowed CPU, all at the same time, and pins each child to its CPU.
2. Each child compresses and decompresses the same 8 MiB buffer 10 times with zlib.
3. Each child counts the round trips that do not give the buffer back. A child that crashes counts as a failure.

One failure on any CPU stops performance mode with the status `not measured`, before any build. Unchanged code that gives wrong data makes every timing on that machine meaningless. When the check cannot run, Atesor adds a warning and continues.

## How does Atesor profile the package?

`profile_package()` in `src/workload.py` reads the curated artifacts of the verified build, or the raw list when the curator wrote none. It uses only paths inside the repository tree:

- An artifact of type `library_static` or `library_shared` is a library.
- A program in a directory such as `test`, `tests`, `example`, `bench`, `demo`, `sample` or `fuzz` is a helper program.
- Every other program is one of the package's own programs.

The kind of the package is `library`, `program`, `library+programs` or `unknown`. `language_of()` gives the language from the build system of the plan: `go` for Go, `rust` for `cargo` or `rust`, and `c` for C and C++ in all other cases.

## How does Atesor build the baseline and each tune?

Each tree is a copy, so the verified tree never changes. `replay_commands()` reads the commands that really ran in the verified build from `command_results_cache`. These commands include the rewrites and the successful retries of the builder. `replayable()` splits each command at `&&` and drops these parts:

- Package installs, for example `apt-get`, `apk`, `pip install` or `rustup`.
- Install steps, for example `make install`, `cmake --install`, `go install`, `cargo install` or `ldconfig`.
- Source control and download steps, for example `git clone`, `git apply`, `patch`, `wget` or `curl`.
- Copies and outputs to a path outside the tree. A `cd` out of the tree drops the rest of its chain.

The result lists up to 20 dropped parts as `not repeated: <part>`. For each tree, `prepare_tree()` and `build_variant()` do these steps in the sandbox:

1. Copy the patched tree to `<repo>.opt/<id>` with `cp -a`.
2. Remove the compiled outputs that git does not track. These are top-level build directories such as `build`, `_build` or `target`, CMake and Meson build directories, ELF files, static archives, and files such as `CMakeCache.txt` or `*.lo`.
3. Write 2 compiler wrappers, `.atesor/cc` and `.atesor/cxx`. Each wrapper logs the call to `.atesor/cc.log`. It then runs the real compiler with the arguments of the call first and the tune flags last, so a tune flag wins over a repeated project flag such as `-O` or `-march`.
4. Run the replayed commands with `CC`, `CXX` and `MAKEFLAGS` set to the wrappers, plus the tune environment, for example `GORISCV64` or `RUSTFLAGS`. Each command has a limit of 1800 seconds, capped at the remaining time budget, with a floor of 60 seconds.

The baseline tree is `<repo>.opt/base`. For C and C++, it builds with `gcc` through the wrappers and no tune flag. The baseline must pass gate 1. Atesor then compares the code of its artifacts with the code of the verified artifacts. A difference gives a warning that the build is not reproducible, and every tune still uses the baseline tree. When the baseline does not build, performance mode stops with the status `error`.

## How does Atesor choose the workload?

`strategies()` gives the workload sources in this order. `choose_workload()` uses the first source that gives a usable workload.

| Order | Source | When it applies | What it gives |
|---|---|---|---|
| 1 | `go-benchmarks` | A Go package | The module's own benchmarks |
| 2 | `program` | The package builds its own programs | One program run that the optimizer agent proposes |
| 3 | `harness` | The package builds a library, or is a Go package | A harness that the optimizer agent writes |
| 4 | `helper-program` | The package has helper programs | One run of a helper program that uses the library |
| 5 | `tests` | Always | The package tests, a weak signal |

- **Go benchmarks.** `go test -list '^Benchmark' ./...` finds the package with the most benchmarks. Atesor builds its test binary with `go test -c` in each tree. It runs the binary with a fixed iteration count (`-test.benchtime <N>x`), so the baseline and the tune do the same work. This source compares no output.
- **Program run.** The agent gets the programs with the first 20 lines of their `--help` output and returns one command template. In the template, `{bin}` is the program, `{input}` is the generated input file and `{output}` is an output file. `check_workload_command()` applies a strict grammar. Each pipe stage starts with `{bin}` or a helper such as `gzip`, `sha256sum` or `wc`. `<` reads only `{input}` or `/dev/null`, and `>` writes only `{output}` or `/dev/null`. Outside quotes, the template has no `;`, `$`, backtick, parenthesis, absolute path or `..` path.
- **Harness.** A harness is a small driver program that calls the library API. For C and C++, `library_api()` collects the exported functions and the headers that declare them, and the agent writes one source file. The harness links the shared libraries of the tree with an `rpath`, and `ldd` must show that it loads the library of the tree, not a system copy. Without shared libraries, it links the static ones. For Go, the agent writes `atesor_bench_test.go` with `BenchmarkAtesor`. For Rust, it writes the Cargo example `atesor_bench`. A harness reads its input one time, does the work N times, and prints one `ATESOR-CHECK` line.
- **Helper program.** Atesor uses only the helper programs that call into the package library, from an `nm` check. The agent then proposes a run, as for a program run.
- **Package tests.** Atesor uses the detected test command only when the tests passed in the port. Go tests are not timed, because `go test` caches results.

Every candidate runs on the baseline tree first:

- A harness must build, exit 0, and print the same `ATESOR-CHECK` line in 2 runs. The module's own Go benchmarks must build and exit 0, and they compare no output. For both, `size_by_iterations()` scales N so that one run takes about 2 seconds. On native hardware, one run must take 0.5 to 5 seconds.
- A program run compares its whole output in 2 runs. `size_by_input()` scales the input from 1 to 512 MiB, so that one run takes about 2 seconds. A run under 0.5 seconds is still usable, and a run over 5 seconds fails.
- A package test run must take 5 seconds or less on native hardware.
- A run that exits 0 and still writes to stderr fails.
- Under QEMU, the input of a program run is at most 4 MiB, and no time limit applies.

`write_input()` writes deterministic input data of kind `binary`, `text`, `json` or `csv` from the fixed seed `atesor-measure`. A crash of the baseline during this check, for example with SIGILL or SIGSEGV, is a fault of the port, and the report says so. Without a workload, a native run builds no tune and stops with the status `not measured`. Under QEMU, the tunes still build and pass gates 1 and 2.

## Which tunes does Atesor try, and in which order?

`build_ladder()` makes the list from the probe and the language, and keeps at most 6 tunes. One PGO tune can follow, so `MAX_VARIANTS` is 7.

For C and C++, `c_ladder()` gives this order:

1. **Core tuning**: `-mtune=<name>` for the probed core, with the first name that the compiler accepts.
2. **Machine ISA**: `-march=rv64gc_<extensions>`. The extensions come from `zicond`, `zfa`, `zfhmin`, `zba`, `zbb` and `zbs`, only when the machine has them and the compiler accepts them.
3. **Vector ISA**: `-march=rv64gcv_<extensions>`, only when the machine has V and the compiler accepts it.
4. **Optimization level**: `-O3`.
5. **Link-time optimization**: `-flto=auto -ffat-lto-objects`, when GCC accepts both flags.
6. **Compiler**: the newest probed clang that emits bitmanip instructions, with its own `-mtune`, `-march` (with V when the machine has it) and `-O3`.

Each GCC tune keeps the flags of the GCC tunes before it. Each tune also gets `-mstrict-align` when misaligned access is not `fast` and the compiler accepts the flag. A tune whose precondition fails is left out, for example for an unknown core. Without GCC in the probe, the list is empty. Atesor skips the `-O3` tune when every source compile of the baseline already uses `-O3`. It skips the LTO tune when a source compile already uses `-flto`. It reads these facts from the wrapper log of the baseline, and it ignores configure checks.

For Go, `go_ladder()` gives one tune, the `GORISCV64` level:

- `rva23u64` needs Go 1.25 or later and the extensions `zba`, `zbb`, `zbs`, `v`, `zicond` and `zfa`.
- `rva22u64` needs Go 1.23 or later and `zba`, `zbb` and `zbs`.
- A machine that lacks only Zbs can get `rva22u64` with Go 1.23 to 1.26, because those releases emit no Zbs instruction. Gate 2 then decides.
- `rva20u64` is the Go default, so it gives no tune.

For Rust, `rust_ladder()` gives this order:

1. `RUSTFLAGS=-C target-cpu=<core>`, when `rustc` knows the core and the machine has every feature of that CPU model. Otherwise `-C target-feature=` with the probed `+zba`, `+zbb` and `+zbs`.
2. Fat LTO with one codegen unit, on top of tune 1.

When the build sets `RUSTFLAGS` itself, only the LTO tune remains.

## How does PGO work?

PGO (profile-guided optimization) builds the code with instrumentation, runs it on a training input, and builds it again with the recorded profile. `_pgo_variant()` adds one PGO tune on top of a base tune. The base tune is the fastest `faster` tune, else the `no change` tune with the lowest time ratio, else the last tune that built under QEMU. PGO applies to C, C++ and Go only. It needs a workload, and for Go the workload must be a Go benchmark: the module's own benchmarks or the `BenchmarkAtesor` harness.

For C and C++, PGO does these steps:

1. A training build adds `-fprofile-generate=<dir>` and sets `CCACHE_DISABLE=1`. GCC also gets `-fprofile-update=atomic` and `-fprofile-prefix-path=<tree>`, so the profile names do not depend on the tree.
2. The training run uses a second input from the seed `atesor-train` when the workload reads an input. It runs 3 times.
3. For clang, `llvm-profdata merge` writes `merged.profdata`.
4. The final build adds `-fprofile-use` with the profile. It then passes the gates and the timing as every other tune.

For Go, the baseline tree records a CPU profile with `-test.cpuprofile` during a 1 second benchmark run. The PGO tune builds with `GOFLAGS=-buildvcs=false -pgo=<profile>`, and gate 1 checks that the binary records `-pgo`. The profile directory is `<repo>.opt/pgo-<id>`, outside the tune trees, because Atesor removes the training tree before the final build.

## What do the gates check?

**Gate 1** (`gate_build_facts()`) reads the artifacts of the tune in the sandbox with `inspect_tree()`. It applies these checks:

- The libraries of the package and the program that the workload runs must exist. When there is neither, every artifact of the verified build must exist. A missing other artifact is a warning.
- Every ELF file and static archive must have `e_machine` 243 (riscv64).
- For C and C++, the wrapper log must show at least one compiler call. This proves that the flags reached the compiler.
- For Go, one binary or more must record the `GORISCV64` level of the tune in `go version -m`, and a PGO tune must record `-pgo`.
- When every artifact has the same code as the baseline, the verdict is `no effect`. The code hash covers the executable sections only, so an embedded build path is not a change.

Gate 1 also counts the instructions of each extension class in the executable sections. On native, it reads up to 8 artifacts and 32 MiB of code in each. Under QEMU, it reads up to 4 artifacts and 1 MiB in each. An instruction from an extension that the machine lacks, and that the baseline does not have, gives a warning, not a failure. Runtime dispatch (ifunc, `riscv_hwprobe`) can contain such code, so gates 2 and 3 decide. The RISC-V unaligned access attribute on a machine without fast misaligned access also gives a warning.

**Gate 2** (`gate_tests()`) applies when the package tests passed for the verified build. The tests must then pass in the tune tree. Atesor copies the tune artifacts to `.atesor/keep` before the tests and puts back each artifact that the tests rebuilt. When the tests did not pass for the verified build, gate 2 is not decisive and passes.

**Gate 3** requires the workload output of the tune to equal the output of the baseline. A run must also not change its input file. The runner hashes stdout, or only the `ATESOR-CHECK` lines for a harness, plus the output file. On native hardware, `bench.measure()` checks this after its first session. Under QEMU, `check_once()` runs each build one time and compares the outputs. A workload that compares no output, such as Go benchmarks or the package tests, has no gate 3 under QEMU.

A tune whose artifacts have the same code as an earlier tune gets the result of that tune, with no new measurement.

## How does Atesor measure a tune?

`bench.measure()` times the baseline (B) and the tune (V) on native hardware only. One runner program in the sandbox runs every timed run, so SSH and podman start-up never enter a measurement. Each run is pinned to one CPU, the highest allowed CPU. Each run also gets an `ATESOR_PAD` environment variable with a random length of 0 to 4096 characters. The padding moves the stack, so one lucky stack layout cannot favor the same build in every round.

The protocol has these steps:

1. The first session runs 3 warm-up runs of each build, then 10 calibration runs of B. The coefficient of variation (CV) of the calibration times gives the noise.
2. The minimum detectable effect (MDE) is `2.8 * CV * sqrt(2 / rounds)`. Atesor uses 20 rounds, or 40 rounds when 20 rounds cannot detect a 2% change.
3. The second session runs 1 warm-up run of each build, then the rounds. Each round runs B and V in a random order.
4. The comparison uses the per-round ratio V/B. It computes the median ratio, its 95% bootstrap interval from 2000 resamples of whole rounds, and the two-sided Mann-Whitney p-value of the two sets of times.

The verdict follows from the interval and the p-value:

- `faster`: the upper bound of the interval is below 0.98, and p is below 0.05.
- `slower`: the lower bound of the interval is above 1.02, and p is below 0.05.
- `no change`: all other results.

Atesor handles noise with these rules:

- A session is `unstable`, with no verdict, when the CPU frequency changes between the start and the end, or a temperature reaches 75 C.
- A warning shows when other work uses more than 0.5 CPU at the start, when the cpufreq governor is not `performance`, or when the MDE is above 2%.
- A warning shows when other Atesor containers run on the machine.
- A measurement with fewer than 5 complete rounds fails.
- A measurement starts only when the budget covers it: 56 runs (2 times 3 warm-ups, 10 calibration runs, 2 times 20 rounds) times the run time.
- Each run has a limit of 300 seconds.
- When the unchanged baseline fails in 2 measurements, Atesor times no later tune, because the machine or the workload gives wrong results.

## When does Atesor accept a tune?

One `faster` verdict is not enough. After all tunes and the PGO tune, Atesor sorts the `faster` tunes by time ratio. It gives the best tune a second check:

- **C and C++**: Atesor builds the tune again with `-falign-functions=64`, and builds the baseline one time with the same flag. The flag changes the code layout but not the code.
- **Rust**: the same check with `-C llvm-args=-align-all-functions=6`.
- **Go**: a second measurement session of the same builds.

The tune must be `faster` again. The first tune that passes the second check is accepted, and the other `faster` tunes get `not checked`. A tune that fails the second check gets `not confirmed`, and the next `faster` tune gets its check.

The time budget is `ATESOR_OPTIMIZE_BUDGET` seconds, with a default of 3600. A step starts only when 300 seconds or more remain. Once a tune is faster, a later tune starts only when the budget still covers the longest tune so far plus the second check of the best tune. For the PGO tune, Atesor counts the longest tune 2 times, because PGO builds and runs twice. These rules give the final status:

- `accepted`: a tune passed the second check.
- `no gain`: no tune was faster, or no gain held in its second check.
- `not confirmed`: a gain got no time for its second check.
- `not measured`: the machine check failed, there is no workload, the budget is shorter than one step, or no tune got a timing.
- `checked`: a QEMU run. The tunes built and passed the gates, with no timing.
- `skipped`: the port is not verified, no tune applies, or the verified build has no repeatable command or artifact.
- `error`: the probe, the inspection of the verified tree or the baseline build failed, or an exception occurred.

## Which steps call a model?

Only the workload choice calls a model. The probe, the tunes, the gates, the timing and the verdicts use no LLM.

| Phase | Source | Role | Wall timeout |
|---|---|---|---|
| `workload-program` | Program run, helper program | `planner` | `ATESOR_LLM_TIMEOUT` plus 15 seconds |
| `harness-c` | C or C++ harness | `builder` | 240 seconds |
| `harness-go` | Go benchmark | `builder` | 240 seconds |
| `harness-rust` | Cargo example | `builder` | 240 seconds |

These limits apply:

- Each question goes through `llm_call_with_validation()` with 2 critique retries and model rotation, also after a timeout.
- When no model of the role answers in time, the models of the other role get the question one time.
- `_agent_rounds()` tries each answer on the baseline tree and sends the error back. It runs 3 rounds, and up to 8 rounds while each round gives a new error. From round 3 on, an error that an earlier round gave stops the rounds.
- The rounds stop when less than 600 seconds of the budget remain.
- Each call adds to `api_cost_usd`. See [LLM layer](/atesor/docs/architecture/llm-layer/).

## What does performance mode write?

- **`state.optimization`**: the result record, with the status, the reason, the machine label, the package profile, the baseline, the workload, one record per tune, the warnings and the notes. The state JSON contains it.
- **`state.machine_profile`**: the `MachineProfile` of the probe.
- **`<repo>.opt/accepted`**: the artifacts of the accepted tune. Atesor removes every other tree under `<repo>.opt`.
- **The report**: a `## Performance Mode (--optimize)` section with one row per tune, and the source of the harness when the agent wrote one.
- **The console**: one line for each step, then a summary that starts with `Optimized: YES`, `Optimized: NO` or, under QEMU, `Optimized: NOT TIMED`.
- **The zip** (with `--package`): the accepted artifacts under `optimized/`, and a manifest with `schema_version` 3 and the `machine` and `optimization` sections.
- **The recipe cache**: `record_optimization()` stores a native result with a workload and the status `accepted` or `no gain`. It writes under `optimizations` in the verified entry, with the core name or the ISA label as the key. It never creates an entry. It keeps only the settings that a later run can repeat, so it drops the `-fprofile` flags and the `GOFLAGS` and `CCACHE_DISABLE` variables.

On the native target, `_run_native()` removes `<repo>.opt` from the machine after the run. With `--package`, Atesor first copies it to the local mirror for the zip.

## Related pages

- [Performance mode](/atesor/docs/guides/optimize/)
- [Architecture overview](/atesor/docs/architecture/overview/)
- [Verification](/atesor/docs/architecture/verification/)
- [LLM layer](/atesor/docs/architecture/llm-layer/)
- [Native RISC-V](/atesor/docs/guides/native-riscv/)
