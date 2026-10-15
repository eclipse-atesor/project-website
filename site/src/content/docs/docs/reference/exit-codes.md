---
title: Exit codes
description: Every exit code that atesor-ai and main.py return, what each code means, and which code paths return it, including code 3 for not verified.
sidebar:
  order: 3
---

Eclipse Atesor™ returns an exit code that tells a script or a CI job how a command ended. Code 0 means success with proven riscv64 output, and code 3 means that the build commands passed but no riscv64 output is proven. This page lists every code that `main.py` returns, and the code paths that return it.

## Which exit codes can Atesor return?

| Code | Meaning |
|---|---|
| `0` | Success. For a port, the artifact scan proved riscv64 output. |
| `1` | Failure: a build that failed or escalated, a setup error, a configuration error, a failed machine probe, or a missing API key. |
| `2` | The build succeeded, but `--package` could not write the zip. The argument parser also uses code 2 for a usage error. |
| `3` | Not verified. The build commands passed, but no riscv64 output is proven. |
| `130` | You interrupted the agent run with Ctrl+C. |

The `atesor-ai` launcher passes the code of `main.py` through unchanged. The launcher itself returns 1 when its bundled interpreter is missing.

The optimize step of performance mode (`--optimize`) never changes the exit code of the port that it follows. But `--optimize` skips the recipe cache check, so a port with `--optimize` always builds, and the build decides the code. Refer to [Performance mode](/atesor/docs/guides/optimize/).

## When does Atesor return 0?

- A port ends with status `SUCCESS`, and the artifact scan gives the verdict `verified`. The console shows `PORTING SUCCESSFUL! (riscv64 output verified)`. This is also true when the optimize step that follows finds no faster build or stops with an error.
- A recipe cache hit has an entry with a `verified` verdict. The console shows `CACHED (not rebuilt)`.
- `--setup-only` completes, or `--rebuild` without `--repo` completes.
- `--probe` probes the machine and writes `machine_profile_<target>.json`.
- `--cleanup` or `--clean-image` ends without `--rebuild`. The code is 0 also when the container or the image does not exist. When Docker or podman fails during the teardown, Atesor prints the error and still returns 0.
- `--clean-workspace` ends. The code is 0 also when you cancel or select an option that is not valid.
- `--preflight` passes all 11 rungs.
- `--help` or `--version` prints its text.

## When does Atesor return 1?

Configuration and arguments:

- `--target` in a short form gives a value that differs from the early read of the flag.
- Preflight rung 1 fails. For example, `ATESOR_TARGET` has a value that is not valid, or the native settings are incomplete.
- With `--optimize` or `--probe`, the `--emulate-cpu` value is not a QEMU CPU model. On `qemu` without the flag, Atesor checks the `ATESOR_QEMU_CPU` value in the same way.
- `--probe` and `--repo` are in the same command.
- `--preflight` runs on the `qemu` target, or a rung fails.
- The `--repo` URL is not a plain `http://` or `https://` URL.
- The command has no `--repo`, no setup command and no `--probe`.
- The API key of the selected provider is missing, or `LLM_PROVIDER` names an unknown provider.
- `LLM_PROVIDER` is `anthropic`, and the `langchain-anthropic` package is not installed.

Sandbox setup:

- Docker does not run or does not answer.
- The `qemu-riscv64` binfmt_misc handler is missing, and the automatic registration fails.
- The image build fails, or the native image build reaches its time limit of 5400 seconds.
- The container does not start after 2 attempts, or it fails the health check.
- The distribution in the container does not match the selected platform.
- On `native`, the container reports an architecture other than `riscv64`.
- The rebuild of both `qemu` sandboxes fails.
- On `native`, preflight rungs 2 to 11 fail before setup, or rungs 2 to 8 fail before a cleanup.

Machine probe (`--probe`):

- The sandbox setup fails, for one of the causes in the list above.
- The probe program gives no result. The console shows `ERROR: the machine probe failed:` and the cause.

Port:

- The run ends with a status other than `SUCCESS`, for example `ESCALATED` or `FAILED`. The console shows `PORTING STOPPED / FAILED`, the last error and the last 10 audit events.
- The agent run raises an error that it does not handle. The console shows `ERROR:` and the error text.

A port escalates when one of these conditions is true:

- The number of recorded errors reaches `--max-attempts`.
- The last 3 errors have the same signature.
- The last error has one of the categories `LICENSE_INCOMPATIBLE`, `REQUIRES_HARDWARE`, `ARCHITECTURE_IMPOSSIBLE`, `PERMISSION` or `DISK_SPACE`.
- The LLM cost of the run is more than 1.0 USD.

A verdict of `wrong_arch` sets the build to `FAILED` and sends it to the fixer. If no fix succeeds, the run ends with code 1.

## When does Atesor return 2?

- The port ends with status `SUCCESS`, `--package` is set, and the zip step raises an error. The console shows `Packaging FAILED`. Atesor wrote the recipe, the report and the state file before the zip step.
- The argument parser rejects the command line. Examples: an unknown option, a `--platform` or `--target` value that is not in the list, a `--max-attempts` value that is not an integer, or an option without its argument.

For a script, check the console output to know which of the two causes applies.

## What does exit code 3 mean?

Exit code 3 means "not verified". The build commands passed, but Atesor cannot prove that the build produced riscv64 machine code. Atesor returns 3 in two cases:

1. A port ends with status `SUCCESS`, but the artifact scan gives the verdict `unverified`. The console shows `PORTING FINISHED, NOT VERIFIED` and the reason.
2. A recipe cache hit has an entry without a `verified` verdict. The console shows `CACHED (not rebuilt), NOT VERIFIED` and `Exit code 3: no riscv64 output is proven for this entry.`

The artifact scan gives `unverified` in these cases:

- The build produced no riscv64 output, for example a header-only library or a package of scripts.
- The scan stopped at its file limit before it read every build output.
- The scan could not run.

Atesor never writes an unverified result to the recipe cache or to the few-shot store. With `--package`, Atesor still writes the zip, and the manifest records `"verified": false`. With `--optimize`, the optimize step records the status `skipped`, because an unverified build gives no baseline. Re-run a cached entry with `--force` to build and verify it again. Refer to [Verification](/atesor/docs/architecture/verification/).

## When does Atesor return 130?

The agent run catches `KeyboardInterrupt`, prints `Interrupted by user`, and returns 130. The agent run includes the optimize step of `--optimize`. After an interrupt, Atesor writes no recipe, report or state file for the run. The `--clean-workspace` prompt also catches the interrupt, but it cancels the cleanup and returns 0. No other step of `main.py` catches the interrupt. An interrupt during the sandbox setup or the machine probe, for example, goes to Python.

## How does `batch_test.py` count the codes?

`.github/scripts/batch_test.py` maps the exit code of each `main.py` run to a status:

| Exit code | Batch status |
|---|---|
| `0` | `PASS` |
| `3` | `UNVERIFIED` |
| `130`, or a shutdown request | `CANCELLED` |
| any other code | `FAIL` |

A run that reaches the time limit of the batch gets the status `TIMEOUT`. Only `PASS` counts as a success. Refer to [Batch runs](/atesor/docs/guides/batch-runs/).
