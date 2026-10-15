---
title: Batch runs
description: Port many packages in parallel with batch_test.py, one container per worker, and how the CI workflows run batches and publish the monthly builds.
sidebar:
  order: 4
---

A batch run ports a list of packages in parallel. Eclipse Atesor™ uses the script `.github/scripts/batch_test.py` for this. Each worker runs `main.py` for one package at a time, in its own sandbox container. The CI workflows use the same script for the weekly and monthly sweeps.

## How do I run a batch?

Run the script from the root of a source checkout. It starts `python3 main.py` for each package and reads `.env` from the root of the repository.

```bash
python3 .github/scripts/batch_test.py                          # the smoke list
python3 .github/scripts/batch_test.py --list full              # the full catalog
python3 .github/scripts/batch_test.py --list full anew gron    # two packages of the full list
python3 .github/scripts/batch_test.py --list path/to/custom.json
python3 .github/scripts/batch_test.py --target native --platform debian --list smoke
```

## What are the flags?

| Flag | Default | What it does |
|---|---|---|
| `--list NAME` | `smoke` | The package list. A bare name means `.github/packages/<name>.json`. A value that has a `/` or ends in `.json` is a path. |
| `--workers N` | The CPU count of the host | The number of parallel workers. It must be from 1 to the CPU count. On native, see below. |
| `--platform NAME` | `ATESOR_PLATFORM`, else `debian` | `alpine`, `debian` or `ubuntu`. It selects the image and the worker container names. |
| `--target NAME` | `ATESOR_TARGET`, else `qemu` | `qemu` or `native`. It overrides `ATESOR_TARGET` for every run. |
| `--package` | off | Pass `--package` to each run. Each build with the status `SUCCESS` then writes a zip under `workspace/packages/`. |
| `--shard-index I` | none | Run only shard `I` (counted from 0). It needs `--shard-total`. |
| `--shard-total N` | none | Cut the list into `N` contiguous shards of `ceil(packages / N)` packages. `1` turns sharding off. |
| `names` | all | Positional package names. The script runs only these packages from the list. |

You cannot use positional names together with `--shard-index` and `--shard-total`. An unknown name, a bad worker count or a bad shard value stops the script with exit code 2.

The CI full jobs do not use `--shard-index` and `--shard-total`. They compute their own shards and pass the package names.

The default platform of `batch_test.py` is `debian`. The default platform of `main.py` is Alpine. Set `--platform` or `ATESOR_PLATFORM` to make them agree.

`batch_test.py` has no option for [performance mode](/atesor/docs/guides/optimize/), so a batch run never optimizes.

## What do the package lists contain?

The lists are JSON files in `.github/packages/`. Each list has `$schema_version` 1, a `packages` array with a `name` and a `url` for each package, and optional `defaults`:

| List | Packages | `max_attempts` | `timeout_seconds` |
|---|---|---|---|
| `smoke.json` | 8 | 5 | 1800 |
| `full.json` | 698 | 5 | 2400 |

The script passes `max_attempts` to `main.py --max-attempts`. It stops a run when `timeout_seconds` ends. Without `defaults`, the values are 5 attempts and 3600 seconds.

## How do the workers share the sandboxes?

Each worker gets its own container, so `apk` and `apt` locks of one package never block another package:

1. The script makes a pool of container names: `<base>-w1` to `<base>-wN`. The base is `atesor-ai-sandbox` for Alpine and `atesor-ai-sandbox-debian` for Debian/Ubuntu.
2. A worker takes a name from the pool and runs `main.py --repo <url> --max-attempts <N> --force --container <name> --platform <platform>`. On native, it also passes `--target native`.
3. `main.py` creates the container on first use from the shared image. The setup lock lets one worker build the image while the others wait.
4. When the run ends, the worker puts the name back. The next package reuses the container and its package cache.

Two list entries with the same derived package name never run at the same time. Each run passes `--force`, so a batch never uses the recipe cache. See [Recipe cache](/atesor/docs/guides/recipe-cache/).

Before the first package, the script runs `main.py --setup-only` for the `w1` container. Then it reads the Go and Cargo versions in the image. If Go is older than 1.26.5 or Cargo is older than 1.90.0, it builds the image again and creates each worker container again.

On the native target, the default worker count is the core count of the machine or its memory in GiB divided by 4, whichever is smaller, and at least 1. `--workers` can go up to the core count. See [Native RISC-V machine](/atesor/docs/guides/native-riscv/).

## How does the script report results?

Each package gets one status from the exit code of `main.py`:

| Status | Cause |
|---|---|
| `PASS` | Exit code 0: riscv64 output verified. |
| `UNVERIFIED` | Exit code 3: the commands passed, but no riscv64 output was proven. |
| `FAIL` | Any other exit code, or an exception in the worker. |
| `TIMEOUT` | The run passed `timeout_seconds`. The script sends `SIGTERM` to its process group, then `SIGKILL` after 10 seconds. |
| `SKIPPED` | The run did not start, or you stopped the batch. |

The script writes the full output of each run to `output/batch_logs/<package>.log`. At the end, it prints a table of all packages, the counts for each status, and the pass rate. The pass rate is the `PASS` count divided by the packages that ran. It counts verified passes only.

Each child run gets `ATESOR_RUN_DEADLINE`, its kill time in epoch seconds. `main.py` then shortens its package test phase, so the report and the zip still fit before the kill. Set `ATESOR_SETUP_STREAM=1` to see the setup output live.

The first Ctrl-C cancels the queued packages, sends `SIGTERM` to the packages that run, and prints the summary. A second Ctrl-C sends `SIGKILL` and exits with 130.

| Exit code | Meaning |
|---|---|
| 0 | No `FAIL`, `TIMEOUT` or `UNVERIFIED` result. |
| 1 | At least one `FAIL`, `TIMEOUT` or `UNVERIFIED` result. Also a missing or invalid list file, a failed setup check, or a native machine whose cores and memory Atesor cannot read. |
| 2 | A bad flag, worker count, shard value or package name, or an unknown `ATESOR_PLATFORM`. |
| 130 | You stopped the batch with Ctrl-C. |

## Which CI workflows run batches?

### `batch-port.yml`

The workflow `ATESOR AI Batch Porting Tests` runs the batches on GitHub Actions under QEMU.

- **Schedule.** Every Saturday at 01:17 UTC, and on the first day of each month at 01:07 UTC. A scheduled run does the full list on both platforms.
- **Manual inputs.** `target` (`smoke`, `full` or `both`), `platform` (`debian`, `alpine` or `both`), `workers` (default 2), `group_size` (default 25), `force_all`, and `llm_provider` (`openrouter`, `gemini`, `openai` or `anthropic`; default `openrouter`).
- **Preflight.** The job first calls `llm-health.yml`, which sends a small real completion to the LLM providers. A manual run gates on the provider that you selected. A scheduled run uses the first working provider of the chain in the repository variable `LLM_PROVIDER_CHAIN`, by default `openrouter,anthropic`. Each batch job then uses that provider. When the provider does not work, the batch jobs do not run.
- **Smoke jobs.** They pull the prebuilt sandbox image, run `--setup-only`, then run `batch_test.py --list smoke --workers <N> --package`.
- **Full jobs.** The `plan-full` job reads the releases of the current month and lists the packages of `full.json` that have no zip for that platform yet. It cuts that list into shards of `group_size` packages. Each shard job runs `batch_test.py --list full --workers <N> --package <names>` and has a limit of 350 minutes.
- **After the full jobs.** One job collects the logs of all shards. Another job merges the new recipe cache entries and few-shot examples of all shards and opens a draft pull request with them. A maintainer reviews and merges it by hand.

### `batch-port-retry.yml`

This workflow starts when `ATESOR AI Batch Porting Tests` completes. It does not start when someone cancelled that run, or when a pull request started it. You can also start it by hand with the ID of a main run. It finds the packages that have no zip from the main run and runs only those again, with `--workers 2 --package`.

- The retries are the hard cases, so the default provider is `anthropic`. A manual run can select `openrouter`, `gemini`, `openai` or `anthropic`.
- An automatic retry uses the first working provider of the chain in the repository variable `RETRY_LLM_PROVIDER_CHAIN`, by default `anthropic,openrouter`.
- The default `group_size` is 25. It must match the main run, so that the retry shards match the main shards.

### Other workflows

- `regression-tests.yml` runs the test suite on each push and pull request to `main` and `dev`, in groups. The `performance-mode` group runs the tests of performance mode. The workflow runs no ports.
- `llm-health.yml` checks the LLM providers `openrouter`, `gemini`, `openai` and `anthropic` every day at 01:00 UTC, and when a batch workflow calls it.
- `package-deb.yml` builds the Debian package of Atesor on a `vX.Y.Z` tag, or when you start it by hand. It runs no ports.

## What are the monthly builds releases?

The batch and retry jobs publish each zip as an asset of a monthly GitHub release in the [releases](https://github.com/eclipse-atesor/atesor/releases) of the repository.

- The tag is `builds-YYYY-MM`, with the title `<Month YYYY> builds`.
- GitHub allows at most 1000 assets in one release. When a release is full, the jobs continue in `builds-YYYY-MM-01`, `builds-YYYY-MM-02` and so on.
- The asset name is `<owner>-<repo>-<YYYYMMDD>-<HHMMSS>-<platform>.zip`, with `alpine` or `debian` as the platform.
- Each repository keeps one asset for each platform in a month. Before an upload, the job deletes the older asset of the same repository and platform from all releases of that month.
- A later full run in the same month does not build a package again when it has an asset for that platform. The manual input `force_all` builds all packages again.

`main.py --package` writes a zip when the build ends with the status `SUCCESS`. This includes a build that is not verified (exit code 3). The `manifest.json` in the zip records the verdict. See [Output files](/atesor/docs/reference/output-files/) for the content of the zip.
