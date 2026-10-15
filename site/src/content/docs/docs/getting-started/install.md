---
title: Install Atesor
description: Install Atesor from the .deb package or from source, then build the riscv64 sandbox image for Alpine or Debian.
sidebar:
  order: 2
---

You can install Eclipse Atesor™ in two ways: from the `.deb` package on the release page, or from a source checkout. After the install, you build a riscv64 sandbox image one time. Check the [requirements](/atesor/docs/getting-started/requirements/) first.

## Which install method should I use?

| Method | Use it when | Command name |
|---|---|---|
| `.deb` package | You port packages on an Ubuntu 22.04 `amd64` host | `atesor-ai` |
| Source checkout | You use another distribution or Python version, you run batch ports, or you change the code | `python3 main.py` |

In these docs, `python3 main.py` and `atesor-ai` are the same command. The two methods take the same flags, with the exception in the next note.

:::note
Performance mode (`--optimize`, `--probe` and `--emulate-cpu`) and the Anthropic provider are in the `main` branch from 2026-10-15. The v0.2.0 `.deb` package (2026-10-01) does not include them. To use them, install from source until the next release.
:::

## Install the .deb package

1. Open the [release page](https://github.com/eclipse-atesor/atesor/releases).
2. Download `atesor-ai_<version>_amd64.deb` and `atesor-ai_<version>_amd64.deb.sha256` from the assets of a release.
3. Calculate the checksum of the package:

   ```bash
   sha256sum atesor-ai_<version>_amd64.deb
   ```

4. Compare the result with the first field of the `.sha256` file, or with the `SHA256` line in the release notes. Do not continue if they are different.
5. Install the package:

   ```bash
   sudo apt-get install ./atesor-ai_<version>_amd64.deb
   ```

   `apt` also installs the dependencies: `python3`, a Docker engine (`docker.io`, `docker-ce` or `docker-engine`), `qemu-user-static`, `binfmt-support` and `ca-certificates`. It recommends `git`.

6. Add your user to the `docker` group, then log out and log in again:

   ```bash
   sudo usermod -aG docker "$USER"
   ```

7. Check the install:

   ```bash
   atesor-ai --version
   atesor-ai --help
   ```

### What does the package install?

| Path | Content |
|---|---|
| `/opt/atesor-ai/app/` | The application code, the Dockerfiles and the seed data |
| `/opt/atesor-ai/app/.env-example` | The reference list of supported environment variables |
| `/opt/atesor-ai/app/BUILD_INFO` | The build date and the versions of the bundled Python packages |
| `/opt/atesor-ai/venv/` | The bundled Python virtual environment |
| `/usr/bin/atesor-ai` | The launcher |

Atesor never writes to `/opt`. It writes its runtime state to `$ATESOR_HOME` if you set it, or else to `~/.local/share/atesor-ai`. On the first run, it copies the bundled recipe cache and few-shot examples into that folder.

To remove the package, run `sudo dpkg -r atesor-ai`. The package scripts then remove `/opt/atesor-ai`. Your state folder stays.

### Build the .deb yourself

To make a package for another base image or another architecture, build it from a source checkout. The build needs Docker on the host.

```bash
packaging/deb/build_deb.sh                # ubuntu:22.04 base
packaging/deb/build_deb.sh debian:12      # another base image
```

The script writes `dist/atesor-ai_<version>_<arch>.deb` and a build log, `dist/atesor-ai_<version>_build.log`. To check the package in a clean container, run `packaging/deb/validate_deb.sh [image]`.

## Install from source

1. Clone the repository:

   ```bash
   git clone https://github.com/eclipse-atesor/atesor
   cd atesor
   ```

2. Install the Python dependencies:

   ```bash
   pip install -r requirements.txt
   ```

   The list includes `langchain-anthropic`, which the Anthropic provider needs.

3. Make your `.env` file from the template:

   ```bash
   cp .env-example .env
   ```

4. Add your API key to `.env`. See [Configure the LLM provider](/atesor/docs/getting-started/configure-llm/).

:::tip
You can install the dependencies into a Python virtual environment. Create it with `python3 -m venv .venv`, then activate it with `. .venv/bin/activate` before step 2.
:::

Unless you set `ATESOR_HOME`, a source checkout keeps its runtime state inside the checkout. The workspace is in `workspace/`, and the recipe cache and the examples are in `data/`. If you plan to contribute, also read [Development setup](/atesor/docs/contributing/development-setup/).

## Build the sandbox image

A sandbox is the riscv64 container where Atesor builds packages. Build the image one time before your first port:

```bash
python3 main.py --setup-only                     # Alpine (musl), the default
python3 main.py --setup-only --platform debian   # Debian/Ubuntu (glibc)
```

With the `.deb`, use `atesor-ai --setup-only` and `atesor-ai --setup-only --platform debian`.

`--setup-only` needs no API key. It does these steps:

1. It checks that `qemu-riscv64` is registered in binfmt_misc, and tries to register it if not.
2. It looks for the image. If the image does not exist, it builds it for `linux/riscv64` from the Dockerfile of the platform.
3. It starts the container and mounts the workspace at `/workspace`.
4. It checks that the distribution in the container matches the platform and that `uname -m` reports `riscv64`.
5. It prints `Setup complete!`.

| Platform | Dockerfile | Image | Container |
|---|---|---|---|
| `alpine` | `Dockerfile` | `atesor-ai-sandbox:latest` | `atesor-ai-sandbox` |
| `debian` or `ubuntu` | `Dockerfile.debian` | `atesor-ai-sandbox-debian:latest` | `atesor-ai-sandbox-debian` |

The image builds under QEMU emulation. The setup message of Atesor tells you to expect 15 to 45 minutes for the first build. Later runs use the cached image.

:::note
Without `--platform`, Atesor looks at the default container `atesor-ai-sandbox` and uses Alpine when it cannot tell. To use the Debian sandbox, pass `--platform debian` on each run, or set `ATESOR_PLATFORM=debian` in your `.env` file.
:::

### Rebuild or remove the sandbox

| Command | Effect |
|---|---|
| `--rebuild` | Builds the image again before the run. Without `--repo`, `--platform` and `--container`, it rebuilds both the Alpine and the Debian sandbox. |
| `--cleanup` | Stops and removes the sandbox container |
| `--clean-image` | Also removes the sandbox image |
| `--clean-workspace` | Shows the size of the workspace folders and asks which ones to empty: `repos/`, `output/`, `logs/`, `.cache/`, or all |

## Next step

[Configure the LLM provider](/atesor/docs/getting-started/configure-llm/).
