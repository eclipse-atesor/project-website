---
title: What is Atesor
description: Eclipse Atesor ports software to RISC-V. It builds each package natively on riscv64, repairs failures, verifies each binary and writes a recipe.
sidebar:
  order: 1
---

Eclipse Atesor™ is an open-source agentic framework that ports software to RISC-V. It builds each package natively on riscv64, repairs what breaks, checks that every binary is real riscv64 code, and writes a recipe that a person or a CI job can replay.

You give Atesor the URL of a source repository. Atesor clones the repository into a riscv64 sandbox and builds it. It repairs the build when it fails, and gives back the result, the evidence and the steps.

## Who is Atesor for?

- **Porters.** Porting work repeats the same steps: clone, find the build system, install packages, hit a known issue, patch, try again. Typical issues are a stale `config.guess`, x86-only SIMD code, the Go `-buildvcs` check, and differences between musl and glibc headers. Atesor runs this loop and records each change that it makes.
- **Distribution and package maintainers.** Atesor builds in an Alpine sandbox (musl) and in a Debian/Ubuntu sandbox (glibc). It keeps a separate recipe for each sandbox, because the `apk` and `apt` commands are different.
- **RISC-V hardware vendors.** The native target runs the same pipeline on a riscv64 machine that Atesor reaches over SSH. Native results stay separate from QEMU results. On the native target, performance mode can also find a faster build of a package for the board.
- **CI owners.** Each run ends with an exit code that a CI job can test. The codes are 0 (verified port), 1 (failure), 2 (packaging failure), 3 (not verified) and 130 (interrupt). The repository also has a batch runner and GitHub Actions workflows that port lists of packages.

## What does a run give back?

Each run that completes the agent pipeline writes a build report and a JSON snapshot of its state. It also writes a debug log and a log of every LLM call. A successful run also gives these items:

- **riscv64 binaries.** The build outputs stay in the build tree. Atesor reads the ELF header of each output to prove that it is riscv64 code. With `--package`, Atesor also writes a zip file with the source tree, the recipe and a `manifest.json`. The manifest lists each riscv64 output, with a SHA-256 for each output inside the zip.
- **A replayable recipe.** The file `<repo>_recipe.md` gives the prerequisites, the build commands, the architecture notes and the commands to check the binaries. Atesor keeps the recipe of each verified port in its recipe cache, so a second request for the same package does not build again. Only `--force` and `--optimize` make Atesor build it again.
- **Patches.** Each patch that the fixer applied, in its own `.patch` file.
- **A faster build (optional).** With `--optimize` on the native target, Atesor can find a faster tune: the same build with other compiler or toolchain settings. With `--package`, the zip holds the artifacts of that tune in `optimized/`.

[Read the output](/atesor/docs/getting-started/read-the-output/) describes each file.

## What does Atesor support today?

| Area | Current scope |
|---|---|
| Languages | C, C++ and Go. Rust and Node.js have partial support only. |
| Build systems | Make, CMake, Meson, autotools and Go modules. Cargo and npm at a lower level. |
| Sandboxes | Alpine Linux riscv64 (musl) and Debian/Ubuntu riscv64 (glibc) |
| Targets | `qemu` (default): QEMU emulation on an x86 or ARM Linux host. `native`: a riscv64 machine over SSH. |
| LLM providers | Gemini (default), OpenAI, OpenRouter and Anthropic |
| Performance mode | Optional, with `--optimize`: faster builds of a verified port for the machine. Only the `native` target measures speed. See [Performance mode](/atesor/docs/guides/optimize/). |
| Install | A `.deb` package for Ubuntu 22.04, or a source checkout |

[Limitations](/atesor/docs/introduction/limitations/) lists what is out of scope today.

## What is Atesor not?

- **It is not a cross-compiler.** Atesor does not build riscv64 code with an x86 or ARM toolchain. Each build runs in a riscv64 container, with the riscv64 compilers and tools of the sandbox image. If one build output is x86-64, aarch64 or riscv32 code, verification fails the port.
- **It is not binary translation.** Atesor does not convert an existing x86 or ARM binary. It builds the package from its source code. On an x86 or ARM host, QEMU runs the riscv64 tools of the sandbox, and the result is riscv64 machine code. [About the name](/atesor/docs/project/name/) compares Atesor with Rosetta, a binary translator.
- **It is not a hardware test.** Verification proves the architecture of each output. The package's own tests run one time after the build, but they do not decide the result of the port.

## Licence and governance

Atesor uses the MIT licence. It is an Eclipse Foundation project in incubation, under the OpenHW Group. See [Governance](/atesor/docs/project/governance/) and the [Eclipse project page](https://projects.eclipse.org/projects/openhw.atesor). The source code is at [github.com/eclipse-atesor/atesor](https://github.com/eclipse-atesor/atesor).

## Next steps

- [How it works](/atesor/docs/introduction/how-it-works/): the flow from a repository URL to a recipe.
- [Requirements](/atesor/docs/getting-started/requirements/): what your host needs.
- [Your first port](/atesor/docs/getting-started/first-port/): port zlib to riscv64.
