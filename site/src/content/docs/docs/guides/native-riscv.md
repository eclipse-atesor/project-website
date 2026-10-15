---
title: Native RISC-V machine
description: "Build on your own riscv64 hardware with --target native: machine requirements, SSH and podman setup, the 11 preflight rungs, settings and safety rules."
sidebar:
  order: 2
---

The native target makes Eclipse Atesor™ build on a real riscv64 machine instead of under QEMU emulation. Atesor reaches the machine over SSH and runs each build in a rootless podman container there. QEMU stays the default target. Use the native target for local builds and tests. CI does not use native machines.

## How does Atesor reach the machine?

Select the target with `--target native` or with `ATESOR_TARGET=native` in `.env`. The flag overrides `.env`. Write the flag in full: Atesor stops with `ERROR: write --target in full, for example --target native.` when you write a short form such as `--targ`.

On the native target, Atesor uses these tools:

- **SSH.** Each native command is one `ssh` call. Every call uses the options `BatchMode=yes`, `ConnectTimeout=10`, `ServerAliveInterval=15`, `ServerAliveCountMax=4`, `ControlMaster=auto` and `ControlPersist=10m`. Each Atesor process opens its own SSH connection and closes it when the command ends.
- **Rootless podman.** Atesor builds the sandbox image on the machine and runs one container there. The container mounts only the work directory, at `/workspace`.
- **rsync.** Atesor reads repository files on your computer too, for example for analysis and packaging. It copies each repository from the machine into a local mirror with `rsync -a --delete --modify-window=-1 --exclude=.git`. The copy goes in one direction only: from the machine to your computer.

Atesor does not use the local Docker daemon or `binfmt_misc` on the native target.

## What does the machine need?

Atesor installs nothing on the machine and never runs `sudo`. The owner of the machine installs these items:

| Requirement | Why |
|---|---|
| riscv64 Linux on real hardware, not a QEMU virtual machine | Native results are the purpose of this target. |
| SSH key login, and a POSIX login shell: bash, dash, zsh or ksh | Atesor runs with no prompts and sends POSIX shell scripts. |
| podman 4.0 or newer, `uidmap`, and subordinate UID and GID ranges for the login user | The builds run in a rootless container. |
| `rsync` on the machine, and `ssh` and `rsync` on your computer | Atesor drives the machine with `ssh` and copies the build tree back with `rsync`. |
| A work directory that is not `$HOME`, not a parent of `$HOME`, and not in `~/.ssh` | Atesor mounts the work directory into the container with SELinux relabeling (`:Z`). |
| 10 GB free for podman storage and 10 GB free in the work directory, or 20 GB when one filesystem holds both | Images, build trees and build caches use this space. |
| Outbound HTTPS | Image builds and package builds download toolchains and sources. |

On a Debian or Ubuntu machine, the owner can install the packages and the ID ranges with these commands:

```bash
sudo apt install podman uidmap rsync
sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 "$USER"
```

Do not run the `usermod` line when `/etc/subuid` already lists the user. Then install your SSH key from your computer one time:

```bash
ssh-copy-id -i ~/.ssh/<key>.pub -p <port> <user>@<address>
```

## How do I configure the native target?

Put these keys in `.env`. Set the target, the platform, and one of the two SSH modes.

| Key | Mode | Value |
|---|---|---|
| `ATESOR_TARGET` | both | `native`. The default is `qemu`. `--target` overrides it. |
| `ATESOR_PLATFORM` | both | `alpine`, `debian` or `ubuntu`. Required on native. `--platform` overrides it. |
| `ATESOR_REMOTE_WORKDIR` | both | The work directory on the machine. The default is `~/atesor-ai`. Use only letters, digits and `. _ / ~ -`. |
| `ATESOR_SSH_HOST` | alias | What you type after `ssh`: a `Host` alias from `~/.ssh/config`, a host name, or `user@host`. |
| `ATESOR_SSH_HOSTNAME` | field | The address of the machine. |
| `ATESOR_SSH_PORT` | field | The SSH port, from 1 to 65535. The default is 22. |
| `ATESOR_SSH_USER` | field | The login user. |
| `ATESOR_SSH_IDENTITY_FILE` | field | The path to your private key, never the key itself. No spaces, quotes or `%`. |

- **Alias mode.** Use it when a plain `ssh <machine>` already logs in. Atesor gives the value to `ssh` with no change.
- **Field mode.** Use it when the provider gives you an address, a port, a user and a key. Atesor writes these values to `~/.cache/atesor-ai/ssh_config` (or `$XDG_CACHE_HOME/atesor-ai/ssh_config`) with mode 0600. The file has one `Host atesor-native` block with `StrictHostKeyChecking accept-new`. Thus the address does not appear in the process list.

Set one mode, not both. Login uses a key only. Any other `ATESOR_SSH_*` key, for example a password key, stops the run. A key with a passphrase needs an active `ssh-agent`.

The platform selects the Dockerfile that podman builds on the machine:

| `ATESOR_PLATFORM` | Dockerfile | Base |
|---|---|---|
| `alpine` | `Dockerfile` | `docker.io/library/alpine:latest` |
| `debian`, `ubuntu` | `Dockerfile.native` | `docker.io/library/debian:trixie` |

`Dockerfile.native` follows `Dockerfile.debian`, with Go 1.26.5 and Rust 1.99.0. It also installs `clang-19`, `lld-19`, `llvm-19` and `libclang-rt-19-dev` for [performance mode](/atesor/docs/guides/optimize/). It has no `HEALTHCHECK` and no `VOLUME`, and it sets `PIP_BREAK_SYSTEM_PACKAGES=1`.

## What does the preflight check?

The preflight is a ladder of 11 rungs in `src/preflight.py`. Run it before your first native build:

```bash
atesor-ai --target native --preflight
```

| Rung | Name | What it checks |
|---|---|---|
| 1 | Configuration | `--target` and the `.env` keys are valid: one SSH mode, a known platform, safe values. |
| 2 | Local tools | `ssh` and `rsync` are on your computer. |
| 3 | SSH config | The SSH control socket path fits the Unix limit. In field mode, the key file exists with mode 0600 or stricter, and Atesor writes the SSH config. |
| 4 | Login and shell | Key login works, and the login shell keeps quoted text unchanged. |
| 5 | Architecture | `uname -m` on the machine reports `riscv64`. |
| 6 | Real hardware | The machine is not a QEMU `virt` board. This check is a heuristic: it reads `/proc/device-tree/compatible` and `mvendorid`. |
| 7 | Podman | The machine has podman 4.0 or newer. |
| 8 | Rootless IDs | `newuidmap` is present, the login user has subordinate UID and GID ranges, and podman runs rootless. |
| 9 | Remote rsync | `rsync` is on the machine. |
| 10 | Work directory | The work directory is safe and writable. Atesor creates it when it does not exist. |
| 11 | Disk | Free space for podman storage and the work directory. |

Rungs 1 to 4 stop at the first failure, because Atesor cannot inspect the machine without them. Rungs 5 to 11 all run. When a rung fails, the report lists every item that the machine still needs, with the command that provides it. Atesor never runs these commands. The owner of the machine runs them, then you run `--preflight` again.

`--preflight` exits with 0 when every rung passes, and with 1 when a rung fails. Without the native target, `--preflight` prints a note and exits with 1.

Every native command also runs the preflight:

- Rung 1 runs first on every command, also on the QEMU target.
- Rungs 2 to 11 run after the recipe cache check, and before `--probe` and the API key check.
- `--cleanup` and `--clean-image` run rungs 2 to 8 only, so they also work on a full disk.
- `--clean-workspace` runs rungs 2 to 10 before it removes the cloned repositories from the machine.

Rung 8 runs `podman info`. On the first run, rootless podman creates its storage directory and starts its pause process (`catatonit -P`). Podman keeps both after the run. Rung 10 creates the work directory with `mkdir -p`.

## How do I build on the machine?

```bash
atesor-ai --target native --setup-only       # build the image one time
atesor-ai --target native --repo https://github.com/madler/zlib --package
```

1. When the image is missing, Atesor builds it on the machine with `podman build --pull=always`. Run `--setup-only` one time to do this before your first port. Atesor sends the Dockerfile over SSH into an empty temporary build context. The build stops at a time limit of 5400 seconds.
2. Later commands find the image and start the container. Atesor creates the container with `podman run -d --init` and one bind mount, `<work directory>:/workspace:Z`. It sets no memory, CPU, DNS or network option.
3. After a port, Atesor removes the repository tree `/workspace/repos/<name>` from the machine. The local mirror keeps its copy. With `--optimize`, Atesor also removes `/workspace/repos/<name>.opt`. Use `--package` to keep the accepted artifacts of performance mode in the zip.
4. The container stops when each command ends.

| Command | What it does on native |
|---|---|
| `--rebuild` | Build the image on the machine again. |
| `--cleanup` | Remove the container with `podman rm -f --volumes`. |
| `--clean-image` | Also remove the image. |
| `--clean-workspace` | Clean the local workspace. When you select the `repos/` option (1 or 5), also remove `<work directory>/repos` on the machine with `podman unshare rm -rf`. |

To find and measure faster builds of a verified port on the machine, use `--optimize`. `--probe` shows what the machine supports. See [Performance mode](/atesor/docs/guides/optimize/).

A batch run on native gets its default worker count from the machine: the core count or the memory in GiB divided by 4, whichever is smaller, and at least 1. `--workers` overrides it, up to the core count.

```bash
python3 .github/scripts/batch_test.py --target native --platform debian --list smoke
```

## Do native and QEMU results mix?

No. Native results and QEMU results never share a file or a cache entry:

| Result | QEMU | Native |
|---|---|---|
| State directory | `workspace/` | `workspace-native/` |
| Recipe cache key | `<platform>-riscv64` | `<platform>-riscv64-native` |
| Zip name | `<owner>-<repo>-<time>-<platform>.zip` | `<owner>-<repo>-<time>-<platform>-native.zip` |
| Report line | `**Target**: qemu` | `**Target**: native` |

## What are the safety rules?

- Atesor never runs `sudo` and never installs anything on the machine. The preflight prints the fix commands for the owner.
- Login uses an SSH key only, with `BatchMode=yes`. Atesor never answers a password prompt.
- Secret values, for example the GitHub token for a private clone, go to the machine on the SSH standard input. They never go in an argv on either computer.
- Before Atesor prints or logs SSH error text, it replaces every IPv4 address with a placeholder. In field mode, it also replaces the host name and the user.
- The work directory must not be `$HOME`, a parent of `$HOME`, or a directory in `~/.ssh`. The `:Z` mount relabels the directory for SELinux, so these locations are not safe.
- The physical path of the work directory must have no spaces or shell metacharacters.
- The container mounts only the work directory.
- When the SSH connection never opened, Atesor checks the login (rung 4) and tries the command one more time. When the connection dropped during a command, the command can be half done, so Atesor does not try again. The run escalates instead.
- When the host key of the machine changes, rung 4 stops. Before you run `ssh-keygen -R <host>`, make sure that the owner reinstalled the machine.

See [Sandboxes](/atesor/docs/guides/sandboxes/) for the image contents, and [Environment variables](/atesor/docs/reference/environment-variables/) for the full list of keys.
