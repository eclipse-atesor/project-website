---
title: Sandboxes
description: The Alpine (musl) and Debian/Ubuntu (glibc) riscv64 sandboxes, how to select one with --platform, and how Atesor builds or pulls their images.
sidebar:
  order: 1
---

A sandbox is the riscv64 Linux container in which Eclipse Atesor™ clones, builds and checks a package. Atesor has two sandboxes: Alpine Linux with musl libc, and a Debian/Ubuntu image with glibc. You select one with `--platform`, and Atesor keeps the results of each sandbox apart.

## What are the two sandboxes?

| | Alpine | Debian/Ubuntu |
|---|---|---|
| `--platform` value | `alpine` | `debian` or `ubuntu` |
| libc | musl | glibc |
| Dockerfile (QEMU target) | `Dockerfile` | `Dockerfile.debian` |
| Base image | `docker.io/library/alpine:latest` | `ubuntu:jammy` |
| Image name | `atesor-ai-sandbox:latest` | `atesor-ai-sandbox-debian:latest` |
| Container name | `atesor-ai-sandbox` | `atesor-ai-sandbox-debian` |
| Install command | `apk add` | `apt-get install -y --no-install-recommends` |
| Target triplet | `riscv64-alpine-linux-musl` | `riscv64-unknown-linux-gnu` |

The `ubuntu` platform is an alias. It uses the same profile, image and container as `debian`. On the QEMU target, the Debian/Ubuntu image starts from `ubuntu:jammy`, not from a Debian image.

### What do both images contain?

- Go 1.26.5, from the official riscv64 tarball on go.dev, with a SHA-256 check. It is in `/usr/local/go`.
- Rust 1.99.0, installed with rustup into `/root/.cargo`.
- `CC=gcc` and `CXX=g++`.
- `GOFLAGS=-buildvcs=false`, `GOPROXY=https://proxy.golang.org,direct` and `GONOSUMCHECK=*`.
- `GOTOOLCHAIN=local`. Go does not download a different toolchain in the middle of a build.
- The directories `/workspace/repos`, `/workspace/output`, `/workspace/logs` and `/workspace/patches`.
- A container health check that runs `gcc --version`.

The images do not use the Go and Rust packages of the distro, because those versions are older. Before an `apk add`, `apt-get install` or `apt install` command runs, Atesor removes these package names from it: `golang`, `golang-*`, `go-1.*`, `gccgo`, `gccgo-*`, `rust`, `rust-*`, `rustc`, `rustc-*`, `cargo` and `cargo-*`.

### What does the Alpine image add?

The Alpine image installs these packages with `apk`: `build-base`, `cmake`, `git`, `curl`, `bash`, `python3`, `ca-certificates`, `file`, `tar`, `xz`, `pkgconfig`, `meson`, `ninja`, `autoconf`, `automake`, `libtool`, `gettext-dev`, `nasm`, `perl`, `linux-headers`, `zlib-dev`, `samurai`, `py3-pip`, `py3-jinja2`, `py3-jsonschema`, `gfortran`, `texinfo`, `patch`, `diffutils`, `protobuf-dev`, `protoc`, `abseil-cpp-dev`, `openssl-dev`, `libpng-dev`, `util-linux` and `coreutils`.

### What does the Debian/Ubuntu image add?

- These packages, installed with `apt-get`: `build-essential`, `cmake`, `git`, `curl`, `ca-certificates`, `file`, `tar`, `xz-utils`, `pkg-config`, `meson`, `ninja-build`, `autoconf`, `automake`, `libtool`, `patch`, `diffutils`, `ccache`, `zlib1g-dev`, `libssl-dev`, `python3`, `python3-pip` and `bash`.
- Autoconf 2.72, built from source. The `Dockerfile.debian` comment says that jammy ships autoconf 2.71, and some projects require 2.72.
- The apt pin file `/etc/apt/preferences.d/99-no-distro-go`. It makes an `apt install` of the distro Go packages fail.
- ccache through `PATH` (`/usr/lib/ccache`), with `CCACHE_DIR=/workspace/.ccache`. `CC` stays `gcc`, because Go's CGO also uses `CC` as its assembler driver.

The image installs only the core build tools. The agents install the libraries that each project needs, for example `libpng-dev`, when the build needs them.

## How do I select a sandbox?

Use `--platform` on any command. Alpine is the default.

```bash
atesor-ai --setup-only                       # Alpine
atesor-ai --setup-only --platform debian     # Debian/Ubuntu
atesor-ai --repo https://github.com/madler/zlib --platform debian
```

In a source checkout, run `python3 main.py` instead of `atesor-ai`.

Atesor selects the profile in this order:

1. The `--platform` flag (`alpine`, `debian` or `ubuntu`). The flag sets `ATESOR_PLATFORM` for the run.
2. `ATESOR_PLATFORM`, from the environment or from `.env`.
3. With `--platform auto` (the default) and no `ATESOR_PLATFORM`, Atesor reads `/etc/os-release` from the sandbox container. It uses the container in `ATESOR_CONTAINER`, else `atesor-ai-sandbox`.
4. When that read fails, or the distro is unknown, Atesor uses Alpine.

The native target does not detect the platform. Set `ATESOR_PLATFORM` or pass `--platform`. See [Native RISC-V machine](/atesor/docs/guides/native-riscv/).

After the container starts, Atesor makes two checks:

- The `ID` in `/etc/os-release` must match the profile. If it does not, the run stops with `ERROR: Platform mismatch` and gives the command `docker rm -f <container>`.
- `uname -m` in the container must report `riscv64`.

## Why does Atesor verify on both libc families?

musl and glibc do not supply the same GNU extensions. Thus a package that builds with glibc can fail with musl. The knowledge block that Atesor gives to the agents on Alpine lists musl symptoms, for example a missing `execinfo.h`, an undefined `backtrace` or `mallinfo`, and an undeclared `REG_RIP`. The Debian/Ubuntu prompt does not include this musl guidance.

Package names are also different. For example, the zlib headers are `zlib-dev` on Alpine and `zlib1g-dev` on Debian. Each profile holds a list of names from the other distro, and Atesor replaces them in install commands before they run.

Atesor does not port to both sandboxes in one command. Run the port one time for each platform. Each result has its own recipe cache entry (`alpine-riscv64` or `debian-riscv64`) and its own few-shot examples. The CI batch workflows run each package list on both platforms. See [Batch runs](/atesor/docs/guides/batch-runs/).

## How do platform profiles work?

`src/platforms.py` defines one `PlatformProfile` for each distro. The `PROFILES` dictionary maps `alpine` to the Alpine profile, and `debian` and `ubuntu` to the Debian profile. The rest of the code reads the active profile through `get_active_profile()` and contains no distro names.

| Field | What Atesor does with it |
|---|---|
| `name`, `display_name`, `libc`, `target_triplet` | Identify the sandbox in prompts, reports and cache keys. |
| `dockerfile`, `native_dockerfile` | Select the Dockerfile for the QEMU target and the native target. |
| `image_name`, `container_name` | Name the image and the default container. |
| `pkg_install`, `pkg_update` | Make install commands, for example `apt-get update && apt-get install -y --no-install-recommends <packages>`. |
| `pkg_lock_file` | Serialize package installs: Atesor wraps each package command in `flock -w 120 <lock file>`. |
| `package_map` | Map a canonical name to a distro package, for example `zlib` to `zlib-dev` or `zlib1g-dev`. |
| `name_corrections` | Replace package names that belong to the other distro. |
| `extra_notes` | Add distro notes to the knowledge block of the scout and fixer prompts. |

To add a distro, see [Add a platform](/atesor/docs/contributing/add-a-platform/).

## How does Atesor build or pull the images?

On the QEMU target, Atesor does these steps for `--setup-only` and for every run that needs the sandbox:

1. Atesor checks that `/proc/sys/fs/binfmt_misc/qemu-riscv64` is enabled. If it is not, Atesor runs `docker run --privileged --rm tonistiigi/binfmt --install riscv64` one time.
2. If the local Docker has the image name of the profile, Atesor uses that image. Else it builds the image from the Dockerfile of the profile, for `linux/riscv64`, and pulls the newest base image for the build.
3. Atesor creates the container if it does not exist. The container uses `--platform linux/riscv64`, the bridge network, the DNS servers `8.8.8.8` and `8.8.4.4`, an 8 GB memory limit (`mem_limit="8g"`), and a bind mount of the local workspace at `/workspace`.
4. If the container mounts a different workspace directory, Atesor removes it and creates it again.

The build runs under QEMU emulation, so the first image build is slow. Later runs use the same image. A lock file, `.container_setup.lock` in the logs directory, lets only one process build the image and create the container. Other batch workers wait for it.

| Command | What it does |
|---|---|
| `--setup-only` | Build the image if it is missing, start the container, then stop. |
| `--rebuild` | Build the image again before the run. You can also set `REBUILD_IMAGE=true`. |
| `--rebuild` with no `--repo`, `--platform` and `--container` | On the QEMU target, build the Alpine image and the Debian image again. |
| `--cleanup` | Stop and remove the container. |
| `--clean-image` | Also remove the image. It includes `--cleanup`. |
| `--container NAME` | Use another container name. Batch workers use this. |

### Prebuilt images in CI

The CI smoke jobs, in the main batch workflow and in the retry workflow, do not build the image. They pull a prebuilt image from Docker Hub and give it the local image name. Then `--setup-only` finds the image and skips the build:

```bash
docker pull --platform linux/riscv64 cloudv10x/atesor-sandbox:debian-latest
docker tag cloudv10x/atesor-sandbox:debian-latest atesor-ai-sandbox-debian:latest
python3 main.py --setup-only --platform debian
```

The Alpine jobs use `cloudv10x/atesor-sandbox:alpine-latest` and the local name `atesor-ai-sandbox:latest`. The full-list CI jobs, and the full-list retry jobs, build the image in the job. The maintainers publish the images with `.github/scripts/release-sandbox.sh`. It builds `Dockerfile` and `Dockerfile.debian` and pushes the tags `<variant>-v<MAJOR>.<MINOR>` and `<variant>-latest`.

### Images on the native target

On the native target, podman builds the image on your riscv64 machine. The `alpine` platform builds `Dockerfile`. The `debian` and `ubuntu` platforms build `Dockerfile.native`, which uses Debian trixie. Only `Dockerfile.native` installs clang: `clang-19`, `lld-19`, `llvm-19` and `libclang-rt-19-dev`. [Performance mode](/atesor/docs/guides/optimize/) uses them for its compiler tune and for profile-guided optimization with clang. See [Native RISC-V machine](/atesor/docs/guides/native-riscv/).
