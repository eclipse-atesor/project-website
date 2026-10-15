---
title: Add a platform
description: Add a sandbox platform profile to Atesor, with its Dockerfile, the PlatformProfile entry, the CLI and batch settings and the tests to add.
sidebar:
  order: 3
---

A platform profile tells Eclipse Atesor™ how one Linux distribution works inside the riscv64 sandbox. It holds the package manager, the package names, the libc and the Dockerfile. This page shows how to add a profile, from the Dockerfile and the `PlatformProfile` entry in `src/platforms.py` to the tests.

## Which platforms exist today?

`PROFILES` in `src/platforms.py` holds three keys and two profiles:

| Key | Profile | libc | QEMU Dockerfile | Native Dockerfile |
| --- | --- | --- | --- | --- |
| `alpine` | `ALPINE_RISCV` | musl | `Dockerfile` | `Dockerfile` |
| `debian` | `DEBIAN_RISCV` | glibc | `Dockerfile.debian` | `Dockerfile.native` |
| `ubuntu` | `DEBIAN_RISCV` | glibc | `Dockerfile.debian` | `Dockerfile.native` |

The `ubuntu` key uses the Debian profile, because the two distributions use the same package names. For how a user selects a platform, see [Sandboxes](/atesor/docs/guides/sandboxes/).

## What is in a platform profile?

`PlatformProfile` is a frozen dataclass. Each field has one job:

| Field | Alpine value | Use |
| --- | --- | --- |
| `name` | `"alpine"` | The `PROFILES` key and the `--platform` value. It also gives the sandbox key `<name>-riscv64` for the recipe cache and the few-shot examples. |
| `display_name` | `"Alpine Linux (riscv64, musl)"` | Console output and prompts |
| `libc` | `"musl"` | `src/knowledge.py` adds musl advice only when the value is `musl` |
| `target_triplet` | `"riscv64-alpine-linux-musl"` | Prompts |
| `dockerfile` | `"Dockerfile"` | The image for the QEMU target |
| `native_dockerfile` | `"Dockerfile"` | The image for the native target |
| `image_name` | `"atesor-ai-sandbox:latest"` | The image tag |
| `container_name` | `"atesor-ai-sandbox"` | The default container name |
| `pkg_install` | `"apk add"` | The install command |
| `pkg_update` | `"apk update"` | The index update command |
| `pkg_lock_file` | `"/tmp/apk.lock"` | The `flock` file that puts parallel installs in sequence |
| `package_map` | `{"zlib": "zlib-dev", ...}` | Canonical name to distro package name |
| `name_corrections` | `{"liblzma-dev": "xz-dev", ...}` | A wrong package name to the correct name |
| `extra_notes` | list of strings | Notes for the system knowledge part of the prompts |

Two helper methods use these fields:

- `install_cmd(packages)` returns `"<pkg_update> && <pkg_install> <packages>"`.
- `resolve(canonical)` returns the `package_map` value, or the canonical name when the map has no entry.

The code reads the package map in these places:

- The dependency resolution in `src/scripted_ops.py`.
- The heuristic build plan.
- The missing-header recovery in the builder.
- The prompts.

`execute_command()` in `src/tools.py` applies `name_corrections` to each package command before the command runs.

## Step 1: Write the Dockerfile

Add `Dockerfile.<distro>` in the root of the repository. Use the existing files as models. The sandbox needs these items:

1. A riscv64 base image. Use `FROM --platform=linux/riscv64` with a fully qualified image name. `main.py` also builds with `platform="linux/riscv64"`. Podman on a native machine can have no short-name alias, so the Alpine file uses `docker.io/library/alpine:latest`.
2. The build tools, `git` and `python3`. The artifact scanner runs a `python3` program inside the sandbox.
3. The `flock` and `timeout` commands. `execute_command()` wraps package commands with `flock` and each command with `timeout --signal=KILL`.
4. Go from the go.dev riscv64 tarball, with the `GO_VERSION` and `GO_SHA256` build arguments and a `sha256sum -c -` check. Set `GOTOOLCHAIN=local`, `GOFLAGS=-buildvcs=false`, `GOPROXY`, `GONOSUMCHECK` and `GOPATH=/root/go`.
5. Rust from rustup, with the `RUST_TOOLCHAIN` build argument, `CARGO_HOME=/root/.cargo` and `RUSTUP_HOME=/root/.rustup`.
6. A `PATH` that holds `${CARGO_HOME}/bin`, `${GOPATH}/bin` and `/usr/local/go/bin`.
7. `WORKDIR /workspace` and the directories `/workspace/repos`, `/workspace/output`, `/workspace/logs` and `/workspace/patches`.
8. `HEALTHCHECK ... CMD gcc --version || exit 1`, and `CMD ["tail", "-f", "/dev/null"]` so that the container does not stop and the agent can use it.

Use the same Go and Rust versions as `Dockerfile` and `Dockerfile.debian`. The tests check that these two files pin the same versions.

Performance mode (`--optimize`) compares GCC with a second compiler when the image has one. The probe looks for `clang` and `clang-19` to `clang-22`. `Dockerfile.native` installs `clang-19`, `lld-19`, `llvm-19` and `libclang-rt-19-dev` for this comparison. Without a usable clang, performance mode leaves out the clang tune. See [Performance mode](/atesor/docs/guides/optimize/).

:::caution
A Dockerfile for the native target must not use `COPY` or `ADD`. The native build sends the Dockerfile with an empty build context.
:::

Do not map `rust` to a distro package. On purpose, the Alpine profile has no `rust` key, and the Debian profile has no `go` key and no `rust` key. The distro packages are older, and they can hide the toolchains of the image on `PATH`.

## Step 2: Add the profile

Add a `PlatformProfile` constant and a `PROFILES` entry in `src/platforms.py`. Use the `ID` value of `/etc/os-release` in the image as the key and as `name`. `detect_platform()` finds that `ID` in `PROFILES`. For an unknown `ID`, it returns the Alpine profile.

This skeleton shows the shape. Replace each `<...>` value:

```python
DISTRO_RISCV = PlatformProfile(
    name="<distro>",
    display_name="<Distro> (riscv64, glibc)",
    libc="glibc",
    target_triplet="<riscv64 target triplet>",
    dockerfile="Dockerfile.<distro>",
    native_dockerfile="Dockerfile.<distro>",
    image_name="atesor-ai-sandbox-<distro>:latest",
    container_name="atesor-ai-sandbox-<distro>",
    pkg_install="<install command>",
    pkg_update="<index update command>",
    pkg_lock_file="/tmp/<distro>.lock",
    package_map={
        "cmake": "cmake",
        "zlib": "<zlib development package>",
    },
    name_corrections={
        "zlib1g-dev": "<zlib development package>",
    },
    extra_notes=[
        "<distro advice for the prompts>",
    ],
)


PROFILES: Dict[str, PlatformProfile] = {
    "alpine": ALPINE_RISCV,
    "debian": DEBIAN_RISCV,
    "ubuntu": DEBIAN_RISCV,
    "<distro>": DISTRO_RISCV,
}
```

Add the new constant to `__all__` too. If the distribution has problems that the LLM must know about, add them to `extra_notes` or to `src/knowledge.py`.

## Step 3: Connect the CLI and the batch runner

The profile alone does not make the platform available everywhere. The docstring of `src/platforms.py` names the minimum: a `PROFILES` entry, a Dockerfile, the `--platform` choices in `main.py` and `target.NATIVE_PLATFORMS`. Change these places:

| File | Place | Change |
| --- | --- | --- |
| `main.py` | `--platform` argument | Add the name to `choices=["alpine", "debian", "ubuntu", "auto"]` and to the help text. |
| `src/target.py` | `NATIVE_PLATFORMS` and `_load_native()` | Add the name to the tuple. The native target accepts only the `ATESOR_PLATFORM` values in it. The error text in `_load_native()` names `alpine, debian or ubuntu`. |
| `main.py` | `expected` in `_provision_sandbox_locked()` and `_NATIVE_DISTROS` | These maps list the `os-release` IDs that a container may report for each profile. A profile that is not in a map accepts only its own name. Add an entry only when the container reports another ID. |
| `main.py` | `rebuild_all_sandboxes()` | This function rebuilds `alpine` and `debian` only. Add the platform if `--rebuild --setup-only` must rebuild it too. |
| `.github/scripts/batch_test.py` | `_PLATFORM_CONTAINERS` | Add the base container name. This map also gives the `--platform` choices of the batch runner. |
| `.github/scripts/batch_test.py` | `_MIN_TOOLCHAIN` | Add the minimum Go and Cargo versions. The batch runner rebuilds a worker container that has older toolchains. |

The batch workflows in `.github/workflows/` have jobs for `debian` and `alpine` only. A CI job for a new platform is a separate change.

## Step 4: Check the package manager code

If the distribution uses `apk` or `apt-get`, the code below works without a change. For another package manager, check each of these places:

- `CommandValidator` in `src/tools.py`: the allowed first words include `apt-get`, `apt`, `apk`, `yum` and `dnf`.
- `_is_pkg_command()` in `src/tools.py`: it decides which commands get the `flock` wrapper, the name corrections and the removal of distro Go and Rust packages. It knows `apk`, `apt-get`, `apt` and `dpkg` only.
- `_is_pkg_lock_error()` in `src/tools.py`: it finds lock errors from `apk` and `apt-get` and starts the retry.
- `_strip_bundled_toolchain_packages()` in `src/tools.py`: it removes distro Go and Rust packages from `apt-get`, `apt` and `apk` install commands.
- The missing-package recovery in `builder_node()` in `src/graph.py`: it reads the package list after `apt-get install -y` or `apk add`.
- The sandbox health check in `src/scripted_ops.py`: it runs `apt-get update` only for `debian` and `ubuntu`.

## Step 5: Add the tests

1. In `tests/test_platforms.py`, add tests for the new profile. Copy the pattern of the existing tests: `install_cmd`, `resolve`, `libc`, the detection from `ID=<distro>` in `/etc/os-release`, and the name corrections.
2. In `tests/test_main.py`, add the platform to `expected` in `TestNativeDockerfiles.test_choice_per_platform_and_target`. The test compares each profile with its QEMU and native Dockerfile.
3. In `tests/test_masterplan_fixes.py`, check the Dockerfile tests. `TestRustToolchainBakedIn` and `TestGoToolchainPin` read `Dockerfile` and `Dockerfile.debian`. `TestPreflightGateTracksImages` maps each `_MIN_TOOLCHAIN` platform to `Dockerfile` for `alpine` and to `Dockerfile.debian` for all others. Change that map when you add a platform to `_MIN_TOOLCHAIN`.
4. In `tests/test_target.py`, `test_platform_is_required_on_native` uses `fedora` as a platform that the native target rejects. Change that value if your new platform is `fedora`.
5. Run the tests:

```bash
PYTHONPATH=. pytest tests/test_platforms.py tests/test_main.py tests/test_masterplan_fixes.py tests/test_tools.py tests/test_target.py
```

If you add a new test file, add it to one category in `.github/workflows/regression-tests.yml`. See [Tests and checks](/atesor/docs/contributing/tests/).

## Step 6: Build and try the sandbox

```bash
python3 main.py --setup-only --platform <distro>
python3 main.py --repo https://github.com/madler/zlib --platform <distro> --verbose
```

The new sandbox key `<distro>-riscv64` has no few-shot examples and no recipe cache entries. The first ports on the platform run with no examples in the prompts. Each verified port then adds examples for the new key. To use the platform on a real riscv64 machine, see [Native RISC-V machine](/atesor/docs/guides/native-riscv/).
