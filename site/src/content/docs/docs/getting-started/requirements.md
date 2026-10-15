---
title: Requirements
description: What your host needs before you install Atesor. Linux, Docker, riscv64 emulation through binfmt_misc, Python 3.10 or newer, and one LLM API key.
sidebar:
  order: 1
---

Eclipse Atesor™ runs on a Linux host and builds each package in a riscv64 Docker container under QEMU emulation. Make sure that your host has the items on this page before you [install Atesor](/atesor/docs/getting-started/install/).

## What does the host need?

| Item | Requirement | Needed for |
|---|---|---|
| Operating system | Linux on an x86-64 or ARM computer | Every run |
| Docker | A running Docker daemon that your user can reach | Sandbox setup, and each port that is not a cache hit |
| riscv64 emulation | `qemu-riscv64` registered in binfmt_misc | Every sandbox start |
| Python | 3.10 or newer | Every run |
| LLM API key | One key for Gemini, OpenAI, OpenRouter or Anthropic | Each port that is not a cache hit |
| git | Installed on the host | A source install. The `.deb` recommends it. |

## Which operating system do I need?

Use a Linux host. Before Atesor starts a container, it reads `/proc/sys/fs/binfmt_misc/qemu-riscv64` on the host. If the riscv64 handler is not there and Atesor cannot register it, Atesor stops.

The host can be x86-64 or ARM. The release workflow builds the `.deb` package on Ubuntu 22.04 for `amd64`. On an ARM host, build the package yourself: `build_deb.sh` takes the architecture from its build container, so an `arm64` host gives an `arm64` package.

## How do I prepare Docker?

1. Install a Docker engine and start the daemon.
2. Add your user to the `docker` group:

   ```bash
   sudo usermod -aG docker "$USER"
   ```

3. Log out and log in again, so that the new group applies.

Atesor connects to Docker through the Docker SDK for Python. If it cannot connect, it prints `ERROR: Docker is not running or not accessible` and stops.

## How do I register riscv64 emulation?

On an x86 or ARM host, register the QEMU handlers one time:

```bash
docker run --privileged --rm tonistiigi/binfmt --install all
```

Atesor also checks the riscv64 handler before each sandbox start. If the handler is not registered, Atesor runs this command one time:

```bash
docker run --privileged --rm tonistiigi/binfmt --install riscv64
```

If that command fails, Atesor prints it as the fix and stops. Without the handler, every riscv64 container exits with `exec format error`.

The `.deb` package installs `qemu-user-static` and `binfmt-support` as dependencies. To check the registration, run:

```bash
ls /proc/sys/fs/binfmt_misc/ | grep -i riscv
```

## Which Python version do I need?

- **Source install.** Use Python 3.10 or newer, as `requirements.txt` states.
- **`.deb` package.** The package brings its own virtual environment, built in an `ubuntu:22.04` container for `python3.10`. The package depends on `python3 (>= 3.10)`. For another distribution or another Python version, build the package again with a matching base image, for example `packaging/deb/build_deb.sh debian:12`.

## Which API key do I need?

You need one key, for the provider that `LLM_PROVIDER` selects:

| `LLM_PROVIDER` | Key variable |
|---|---|
| `gemini` (default) | `GOOGLE_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |
| `anthropic` | `ANTHROPIC_API_KEY` |

Atesor checks the key only before a port. `--setup-only`, `--probe` and a recipe cache hit need no key. [Configure the LLM provider](/atesor/docs/getting-started/configure-llm/) tells where to put the key.

## What network access does Atesor need?

- **Image build.** Docker pulls the base image, and the image build downloads distribution packages and the Go and Rust toolchains.
- **Ports.** Atesor clones each repository inside the container, and the build installs distribution packages. The container uses the DNS servers `8.8.8.8` and `8.8.4.4`.
- **LLM calls.** Each call goes to the provider over HTTPS.

## How much disk space and memory do I need?

The code and the project docs state no minimum disk space for a QEMU host. The workspace holds the cloned repositories, the outputs, the logs and the zip files. `--clean-workspace` shows the size of each workspace folder and asks which ones to empty. It does not offer the `packages/` folder, which holds the zip files.

Atesor starts the QEMU container with a memory limit of 8 GB.

The only stated disk figure is for a native machine. It needs 10 GB free for podman storage and 10 GB free in the work directory, or 20 GB when one filesystem holds both.

## What does the native target need?

The native target needs a riscv64 Linux machine on real hardware, with SSH key login, podman 4.0 or newer, rootless user IDs and `rsync`. See [Native RISC-V machine](/atesor/docs/guides/native-riscv/).

Performance mode (`--optimize`) measures speed only on the native target. See [Performance mode](/atesor/docs/guides/optimize/).

## Next step

[Install Atesor](/atesor/docs/getting-started/install/).
