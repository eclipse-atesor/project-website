---
title: Performance mode
description: How --optimize builds faster variants of a verified port, checks that they give the same results, and measures them on native riscv64 hardware.
sidebar:
  order: 7
---

Performance mode (`--optimize`) builds faster variants of a verified port for the machine that runs Eclipse Atesor™. Atesor checks each variant and measures it against the verified build. Use it on a native riscv64 machine to find out if other compiler or toolchain settings make the package faster on that machine.

Each variant is a "tune": the same build with other compiler or toolchain settings. The verified build always stays the result of the port. An accepted tune is an extra output, and only a measurement on real riscv64 hardware can accept it.

## What do I need?

- **A verified port.** Performance mode runs after the finish step of the port. A port that is not verified gets the status `skipped`. A port that fails goes to escalation, and performance mode does not run.
- **A native machine for a time measurement.** Use `--target native`. On the QEMU target, Atesor builds and checks the tunes, but it measures no time and never accepts a tune. See [Native RISC-V machine](/atesor/docs/guides/native-riscv/) for the setup of the machine.
- **A quiet machine.** Set the cpufreq governor of the board to `performance`. Atesor never changes a board setting. It warns when the governor is different, when other work uses the CPUs, and when other Atesor containers run on the machine.
- **clang for the compiler tune.** Only `Dockerfile.native` installs a clang (`clang-19`, with `lld-19`, `llvm-19` and `libclang-rt-19-dev`). The Alpine image and the QEMU images have no clang, so they get no compiler tune. A native image that you built from an older checkout has no clang. Build it again one time with `python3 main.py --target native --setup-only --rebuild`.
- **An LLM API key**, as for a port. The optimizer agent (an LLM) proposes a program run or writes a harness, which is a small driver program for a library. A harness comes from the models of the builder role, with a 240-second time limit. A program run comes from the models of the planner role. When no model of the role answers in time, the models of the other role get the question one time.
- **Time.** The default time limit is one hour, after the port.

The LLM calls of performance mode add to the API calls, tokens and cost of the run. Each workload round costs at least one LLM request. The $1.00 cost cap does not stop performance mode: the supervisor checks the cap, and performance mode runs after the finish step. The module's own Go benchmarks and the package tests need no LLM call. See [Cost control](/atesor/docs/guides/cost-control/).

:::note
Performance mode is on `main` since 2026-10-15. The v0.2.0 `.deb` package (2026-10-01) does not include it. Run it from a source checkout with `python3 main.py` until the next release. See [Install Atesor](/atesor/docs/getting-started/install/).
:::

## How do I run it?

```bash
python3 main.py --probe --target native
python3 main.py --target native --repo https://github.com/madler/zlib --optimize --package
```

The first command shows what the machine supports and the settings that follow from it. The second command ports the package, then runs performance mode. To build and check the tunes under QEMU, give a QEMU CPU model:

```bash
python3 main.py --repo https://github.com/madler/zlib --optimize --emulate-cpu rva22u64
```

| Flag or variable | Default | What it does |
|---|---|---|
| `--optimize` | off | After a verified port, build, check and measure tunes. |
| `--probe` | off | Probe the machine, print the result, save it to `machine_profile_<native\|qemu>.json` in the output directory, then exit. |
| `--emulate-cpu MODEL` | not set (QEMU `max` CPU) | The `QEMU_CPU` model for `--optimize` and `--probe` on the QEMU target. |
| `--target` | `qemu` | Use `native` for a time measurement. |
| `--force` | off | With `--optimize`, ignore the cached recipe and plan again. |
| `--package` | off | Also put the accepted artifacts in the zip, under `optimized/`. |
| `ATESOR_OPTIMIZE_BUDGET` | `3600` | The time limit of performance mode, in seconds. A value that is not a number gives 3600. |
| `ATESOR_QEMU_CPU` | not set | The environment form of `--emulate-cpu`. The flag wins. |

### Rules for `--probe`

- `--probe` runs alone. With `--repo`, Atesor stops with an error and exit code 1.
- `--probe` needs the sandbox, but no API key. On the native target, the preflight runs first.
- The output has the lines `Machine:`, `ISA label:`, `Extensions:`, `Vector:`, `Core:`, `Misaligned:`, `CPUs:`, `Kernel/libc:`, `Sources:`, `Governor:` and one `Compiler:` line for each compiler. Then it shows the settings: `Flags:`, `Go:` and `Rust:`.
- On the native target, the last line is `QEMU model:`. It gives an `--emulate-cpu` value that models your board under QEMU. This value needs QEMU 9.0 or later.

### Rules for the CPU model

- A model must start with a letter. It can contain letters, digits and `_ . , = + -`, up to 512 characters. Else Atesor stops with `is not a QEMU CPU model` and exit code 1.
- The model `max`, with or without extra properties, counts as no model. Atesor then builds no ISA tune, because no real board has that extension set.
- On the native target, Atesor ignores `--emulate-cpu` and gives a warning: on the console with `--probe`, and in the report with `--optimize`. It also ignores `ATESOR_QEMU_CPU`.
- Without `--optimize` or `--probe`, Atesor ignores the model.

### Performance mode and the recipe cache

`--optimize` needs a real build tree, so it skips the recipe cache fast path. When the cache has a verified recipe of the package, that recipe becomes the build plan. At the start of the run, the console then shows a `Recipe:` line that says `from the cache`.

- `cached_recipe_node` turns the cached build plan into the plan and applies the cached patches first. The analyst and the scout make no LLM call.
- When the build fails anyway, for example because the source changed, the fixer and the normal planning loop take over.
- `--force` makes Atesor plan again.

Performance mode never changes the exit code of the port. An error in performance mode goes into the report. `batch_test.py` has no option for performance mode, so a batch run never optimizes.

## What happens during a run?

The console shows performance mode as its own step, `optimize_node`, with the status `OPTIMIZING`, after `finish_node`. Atesor prints one line for each part of the work. The full internals are in [Performance mode internals](/atesor/docs/architecture/optimize/).

1. **Machine probe.** Atesor reads the ISA extensions (test instructions, `riscv_hwprobe` and `/proc/cpuinfo`), the core, the speed of misaligned memory access, the CPUs, the cpufreq governor, and the compilers with the flags that they accept. A probe that fails stops performance mode with the status `error`.
2. **Machine check (native only).** Each CPU that the sandbox may use runs 10 zlib round trips of 8 MiB, all CPUs at the same time. Unchanged code must give the data back. When it does not, Atesor stops before it builds anything, because no time measurement on that machine is reliable.
3. **Package type.** The artifacts of the verified build give the language (C/C++, Go or Rust) and the type: a library, programs, or both. Programs in test, example and benchmark folders do not count as programs of the package.
4. **Baseline.** Atesor builds the verified build again in a copy, `<repo>.opt/base`. It compares each tune with this copy, so only the change of the tune counts. When the code of the copy is different from the verified build, Atesor warns that the build is not reproducible.
5. **Workload.** Atesor selects a workload that does the same fixed work in every run.
6. **Tunes.** Atesor makes the list of tunes from the probe and the language. It skips a tune that the build already has.
7. **Rebuild.** Each tune builds in a fresh copy of the patched tree, `<repo>.opt/<id>`, with the commands of the verified build. A tune build does not repeat package installs, install steps, source control steps, or writes outside the tree.
8. **Gates.** Each tune must pass three correctness checks.
9. **Measurement (native only).** Atesor times each tune against the baseline.
10. **Profile-guided optimization.** After the list, Atesor tries profile-guided optimization (PGO) on top of the best tune.
11. **Second check (native only).** A faster tune must win again in a second check before Atesor accepts it.
12. **Finish.** The verified tree never changes. Atesor copies the riscv64 artifacts of the accepted tune to `<repo>.opt/accepted` and removes the other trees.

## Which tunes does Atesor try?

| Language | Technique | What the tune changes | When Atesor builds it |
|---|---|---|---|
| C/C++ | `core tuning` | `-mtune=<core>` | The probe knows the core, and GCC accepts a tune name for it. |
| C/C++ | `machine ISA` | `-march=rv64gc_<extensions>`, with only the probed extensions | The machine has one or more of Zicond, Zfa, Zfhmin, Zba, Zbb and Zbs, and GCC accepts them. |
| C/C++ | `vector ISA` | `-march=rv64gcv_<extensions>` | The machine has V, and GCC accepts it. |
| C/C++ | `optimization level` | `-O3` | Not every source compile of the build uses `-O3` already. |
| C/C++ | `link-time optimization` | `-flto=auto -ffat-lto-objects` | GCC accepts both flags, and no source compile uses `-flto` already. |
| C/C++ | `compiler` | The newest probed clang, with its own `-mtune`, `-march` (with V) and `-O3` | The probe finds a clang (`clang`, or `clang-19` to `clang-22`) that emits bitmanip code. |
| Go | `machine ISA` | `GORISCV64=rva22u64` or `GORISCV64=rva23u64` | The probe gives a level above `rva20u64`, the default of Go. |
| Rust | `target CPU` | `RUSTFLAGS=-C target-cpu=<cpu>` | rustc knows the CPU of the core, and every feature that it adds is on the machine. |
| Rust | `machine ISA` | `RUSTFLAGS=-C target-feature=...` with the probed ones of `+zba`, `+zbb` and `+zbs` | Instead of `target CPU`, when that tune does not apply. |
| Rust | `link-time optimization` | `CARGO_PROFILE_RELEASE_LTO=fat` and `CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1` | Always. |
| C/C++ and Go | `profile-guided optimization` | A profile from a training run, on top of the best tune | C/C++ with a workload, and Go with a Go benchmark workload. Never Rust. |

- Each GCC tune keeps the flags of the tune before it. The vector tune replaces the scalar `-march`.
- When misaligned access is not `fast`, each C/C++ tune also gets `-mstrict-align`, if the compiler accepts it.
- The core table in `src/machine.py` knows five cores: `sifive-u74`, `sifive-p550`, `spacemit-x60`, `thead-c906` and `thead-c910`. An unknown core gets no core tuning.
- Under QEMU, ISA tunes need a named `--emulate-cpu` model.
- `GORISCV64=rva23u64` needs Go 1.25 or later. `rva22u64` needs Go 1.23 or later. A machine with Zba and Zbb but without Zbs can still get `rva22u64` with Go 1.23 to 1.26, because these releases emit no Zbs instruction for it. Then the package tests decide.
- When the build sets `RUSTFLAGS` itself, Atesor tries only the Rust LTO tune.
- Without GCC in the probe, Atesor tries no C/C++ tune.
- At most 7 tunes run: up to 6 from the list and one PGO tune.

The flags of a C/C++ tune reach each compiler call through wrapper scripts in `<tree>/.atesor/`, which `CC`, `CXX` and `MAKEFLAGS` name. The wrapper adds the tune flags after the flags of the project, so the tune wins for repeated options such as `-O` and `-march`. Go and Rust tunes use environment variables.

Example: `tests/test_optimize.py` uses a test profile of a SiFive P550 core with Zba and Zbb, no Zbs, no V, and slow misaligned access. For that profile, the C/C++ list is:

| Tune | Technique | Value |
|---|---|---|
| `Tune-1` | `core tuning` | `-mtune=sifive-p550 -mstrict-align` |
| `Tune-2` | `machine ISA` | `-march=rv64gc_zba_zbb` |
| `Tune-3` | `optimization level` | `-O3` |
| `Tune-4` | `link-time optimization` | `-flto=auto -ffat-lto-objects` |
| `Tune-5` | `compiler` | `clang-19` |

The same profile gives Go `GORISCV64=rva22u64`, with a note about Zbs. It gives Rust `-C target-cpu=sifive-p550`, then fat LTO.

## How does Atesor judge a tune?

### Which workload does Atesor time?

A workload must do the same fixed work in every run, so its run time shows the speed of the build. Atesor tries these sources in order and uses the first one that passes its checks:

1. **Go benchmarks.** For a Go module, the benchmarks of the package that has the most benchmarks, with a fixed iteration count.
2. **A program run.** When the package builds its own programs, the optimizer agent proposes one command that runs a program on generated input.
3. **A harness.** For a library, or any Go module, the optimizer agent writes a harness against the public API: a C or C++ file, a Go benchmark `BenchmarkAtesor`, or a Cargo example `atesor_bench` for a Rust crate. A C/C++ harness links the library of the tree. With a shared library, `ldd` must show that the harness loads the copy in the tree.
4. **A test or example program** of the package that calls its library. The optimizer agent proposes a run of it.
5. **The package tests.** They are a weak signal, because tests check correctness and do not model real use. Atesor never times Go tests, because `go test` caches results.

Each candidate runs on the baseline tree first. The checks are:

- The candidate must build and exit with 0. A run that exits with 0 and still writes to stderr also fails.
- A harness must print the same `ATESOR-CHECK` line in two runs. A program run compares its whole output. Go benchmarks compare no output.
- On native hardware, one run must take 0.5 to 5 seconds. Atesor sets the iteration count of a harness or of Go benchmarks for about 2 seconds for each run. It scales the input of a program run instead, and a program run can take less than 0.5 seconds.
- The package tests run one time, on native hardware only, and only the 5-second limit applies.
- Under QEMU, one iteration is enough, because QEMU measures no time.

When a check fails, the optimizer agent gets the error and tries again: 3 rounds, and up to 8 rounds while each round gives a new error. The rounds stop when less than 600 seconds of the time limit are left. The input is generated data of the kind `binary`, `text`, `json` or `csv`. The same seed always gives the same bytes. Atesor does not use benchmark suites that run for a fixed time, for example Google Benchmark or criterion, because their run time does not show the speed.

### The gates

1. **Artifacts.** The artifacts must exist and be riscv64. For C/C++, the wrapper log must show compiler calls, so the flags reached the compiler. For Go, a binary must carry the `GORISCV64` value of the tune. Code that is equal to the baseline gives the result `no effect`.
2. **Package tests.** When the tests of the baseline pass, the tests of the tune must pass too. When the baseline tests did not pass, this gate does not decide. When the tests build an artifact again, Atesor puts back the build of the tune.
3. **Workload output.** The output of the workload must be equal to the output of the baseline, and a run must not change its input file.

- Gate 1 fails a tune that does not build a library of the package or the program that the workload times. Another missing artifact gives only a warning.
- Instructions from extensions that the machine lacks give a warning, not a failure, because runtime dispatch can contain them legitimately. Gates 2 and 3 decide.
- A tune with the same code as an earlier tune gets the result of that tune, without a new measurement.

### The measurement (native only)

1. Atesor warms up both builds with 3 runs each. Then it times 10 baseline runs. These runs give the noise and the minimum detectable effect. For a workload with output to compare, the outputs of these runs must match.
2. Atesor runs 20 rounds, or 40 rounds when 20 rounds cannot detect a 2% change. Each round runs the baseline and the tune in random order.
3. Each run is pinned to one CPU, the highest-numbered CPU that the sandbox may use. Each run also gets a random environment padding, so a lucky stack address cannot favor one build.
4. Atesor compares the time ratio of tune to baseline: the median of the ratios of the rounds, a 95% bootstrap interval, and a Mann-Whitney p-value.
5. A tune is `faster` when the upper bound of the interval is below 0.98 and p is below 0.05. It is `slower` when the lower bound is above 1.02 and p is below 0.05. Else the result is `no change`.
6. Atesor discards a session as `unstable` when the CPU frequency changes or the temperature reaches 75 °C.

One measurement needs about 56 runs. A measurement that the remaining time cannot finish does not start. When the unchanged baseline fails 2 timing runs, Atesor times no more tunes, because the machine or the workload gives wrong results.

### The second check and the acceptance

A faster tune must win again in a second check:

- **C/C++.** Atesor builds the tune again with `-falign-functions=64`. It compares it with a baseline that has the same flag, so a gain from a lucky code layout cannot pass.
- **Rust.** The same change through LLVM: `-C llvm-args=-align-all-functions=6` in `RUSTFLAGS`.
- **Go.** A second measurement session.

Atesor checks the faster tunes in order, the best time ratio first. The first tune that passes the second check is the accepted tune. A faster tune after it gets `not checked`. A gain that did not hold, or that got no second check, is `not confirmed`. After a tune is faster, Atesor runs a later tune only when the time limit still covers that tune and the second check.

## What do I get back?

### The console

During the step, each line starts with a key: `Machine`, `Health`, `Package`, `Baseline`, `Workload`, `Tune-<n>`, `Check` or `Result`. Indented lines under a key give the details, for example the lines that start with `why:`, `fix:` and `note:`. This example from `tests/test_optimize.py` shows a port that is not verified:

```text
Result   : NO: performance mode was skipped
           why: the port is not verified, so there is no baseline
```

After the port summary, Atesor prints the answer in one line, then one line for each tune:

```text
   Optimized: <answer>
     Why: <reason>
     Fix: <advice>
     Tune-<n>  <technique>  <value>  <result>  <- accepted
   Optimized files: /workspace/repos/<repo>.opt/accepted (with --package also in the zip under optimized/)
```

`Why:` shows when Atesor accepts no tune. `Fix:` shows when Atesor has advice. The answer is one of these:

| Answer | Status |
|---|---|
| `YES: <tune> (<settings>) is <n>% faster than the verified build` | `accepted` |
| `NO: no tune was clearly faster than the verified build` | `no gain` |
| `NO: no faster tune was confirmed` | `not confirmed` |
| `NO: no tune could be timed` | `not measured` |
| `NOT TIMED: QEMU checks the builds and their output; only native hardware measures speed` | `checked` |
| `NO: performance mode was skipped` | `skipped` |
| `NO: performance mode stopped with an error` | `error` |

For the status `no gain` or `not confirmed`, the answer also names the best timed tune in parentheses, after `best:`.

### Files and records

- **The report.** `<repo>_report_<time>.md` has a `Machine Profile` section and a `Performance Mode (--optimize)` section. The second section gives the answer, the status, the machine, the package, the baseline, the workload and the duration. Its table has the columns `Tune`, `Technique`, `Settings`, `Result`, `Time ratio (95% CI)` and `Details`. Then it lists the warnings, the notes and the source of the harness.
- **The state file.** `<repo>_state_<time>.json` has the fields `optimization` and `machine_profile`.
- **The accepted artifacts.** They are in `<repo>.opt/accepted`, next to the repository tree. On the native target, Atesor removes `<repo>.opt` from the machine when the command ends. With `--package`, Atesor first copies it to the local mirror.
- **The zip.** With `--package`, the zip has the accepted artifacts in `optimized/`. The manifest has schema version 3, with the sections `machine` and `optimization`. A run without `--optimize` writes schema version 2.
- **The recipe cache.** A native result with a workload and the status `accepted` or `no gain` goes into the cache entry of the verified build, under `optimizations`. The key is the core name of the machine, else its ISA label, so results from different boards stay apart. Atesor never makes a new cache entry for a result.
- **The machine profile.** `--probe` writes `machine_profile_native.json` or `machine_profile_qemu.json` to the output directory.

See [Output files](/atesor/docs/reference/output-files/) for the location of each file.

### Native and QEMU

| | Native | QEMU |
|---|---|---|
| Probe | The board | The `--emulate-cpu` model, else the QEMU `max` CPU |
| Machine check | Yes | No |
| ISA tunes | Yes | Only with a named `--emulate-cpu` model |
| Gates | Yes | Yes, on the emulated CPU |
| Time measurement | Yes | No |
| Accepted tune | Yes | Never |

Emulation speed says nothing about the speed of hardware, so a QEMU run only builds and checks the tunes. Under QEMU, a tune without a workload, or with a workload that has no output to compare, gets `built` after gates 1 and 2.

## What are the limits?

| Case | Result |
|---|---|
| The port is not verified | `skipped`: `the port is not verified, so there is no baseline` |
| No tune applies to the machine and the build system | `skipped` |
| The verified build has no repeatable command, or no artifact in the tree | `skipped` |
| The machine probe fails | `error` |
| The verified build does not build again in the copy | `error` |
| The machine check gives wrong data | `not measured`, with `Fix: make the machine stable first (a lower CPU frequency, a memory test), then run again` |
| The time limit is below 300 seconds | `not measured`, before any build |
| No workload passes its checks on native hardware | `not measured`, and Atesor builds no tune |
| The verified build crashes while it runs the workload | A `port problem:` line, because the baseline has no tune flags |
| The time limit ends before a second check | `not confirmed`, with `Fix: run again with a larger ATESOR_OPTIMIZE_BUDGET` |

This example from `tests/test_optimize.py` shows a machine check that failed:

```text
Health   : 3 of 40 zlib round trips gave wrong data (CPU 0: 1, CPU 1: 2)
```

Other limits come from the code:

- Before each tune, Atesor checks the time limit. With less than 300 seconds left, it skips the tune. Each build has a limit of 1800 seconds, or the time that is left when that is shorter (at least 60 seconds).
- A harness may not use calls that make runs differ or reach outside the sandbox. Examples are `system`, `fork`, `socket`, `rand`, `time` and `clock_gettime` in C, `os/exec`, `net` and `time.Now` in Go, and `std::process::Command` and `Instant::now` in Rust. A harness source must be 32,000 bytes or less.
- A program run uses a strict grammar. Each pipe stage starts with `{bin}` or a helper such as `cat`, `gzip`, `head`, `sha256sum` or `wc`. `<` reads only `{input}` or `/dev/null`, and `>` writes only `{output}` or `/dev/null`.
- A program run that takes more than 5 seconds with the smallest input (1 MiB) fails. The command must do less work for each byte.
- Instructions that the machine lacks give only a warning. A tune with such instructions can stop with `SIGILL` in the package tests or in the workload run.
- Atesor never accepts a QEMU result, and never stores one in the recipe cache.
