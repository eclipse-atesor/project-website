---
title: Recipe cache
description: What the recipe cache stores, how Atesor keys and writes it, how a cache hit replays a recipe without a build, and how to bypass or clear it.
sidebar:
  order: 3
---

The recipe cache is a JSON file in which Eclipse Atesor™ keeps the recipe of each verified port. When you port the same repository again on the same sandbox, Atesor writes the recipe from the cache and skips the full pipeline. A cache hit needs no API key, no LLM call and no running sandbox.

## What does the cache store?

The file is `data/recipe_cache.json` in the state home of Atesor. It has this shape:

```json
{
  "version": "2.0",
  "packages": {
    "zlib": {
      "alpine-riscv64": { "repo_url": "...", "build_plan": { "phases": [] } },
      "debian-riscv64": { "repo_url": "...", "build_plan": { "phases": [] } }
    }
  }
}
```

Each entry holds these fields:

| Field | Content |
|---|---|
| `repo_url` | The repository URL of the port. |
| `build_system` | The detected build system. |
| `architecture` | `riscv64`. |
| `sandbox` | The sandbox key, for example `debian-riscv64`. |
| `last_built` | The time of the build. |
| `build_plan` | The phases of the build, each with its name and commands. |
| `dependencies` | The system packages of the build. |
| `patches` | The applied diffs, at most 10. |
| `artifacts` | The build outputs, at most 20, each with its type, path and role. |
| `build_duration_seconds` | The duration of the run. |
| `recipe_file` | `output/<repo>_recipe.md`. |
| `recipe_markdown` | The full text of the recipe. |
| `verification` | The verdict of the artifact scan: `status`, `reason` and `source_commit`. |
| `optimizations` | Only after `--optimize` on the native target: the results of performance mode, one for each machine. |

## What is the cache key?

The key has two parts: the package name and the sandbox.

- **Package name.** Atesor derives it from the URL with `derive_repo_name()`. It is the last segment of the URL, without `.git`. Each character that is not a letter, a digit, `.`, `_` or `-` becomes `-`. When that segment is a generic name (`cli`, `core`, `src`, `app`, `main`, `client`, `server` or `lib`), Atesor adds the owner. For example, `github.com/smallstep/cli` gives `smallstep-cli`.
- **Sandbox.** The key is `<profile>-riscv64`, for example `alpine-riscv64`. The native target adds `-native`, for example `debian-riscv64-native`. The `ubuntu` platform uses the Debian profile, so its key is `debian-riscv64`.

An entry for one sandbox never answers for another sandbox, because `apk` and `apt` commands are not interchangeable. An entry also counts only when its stored URL matches the URL of the run. Atesor compares the URLs without case, without a trailing slash and without `.git`. Thus a different repository with the same name does not get the recipe.

## When does Atesor write an entry?

Atesor writes an entry only after a verified port. The build must end with the status `SUCCESS`, and the artifact scan must give the verdict `verified`. Atesor does not cache a build whose commands pass but that proves no riscv64 output (exit code 3). It also does not cache a failed or escalated run.

A new entry for the same package and sandbox replaces the old one, also its `optimizations`. Atesor takes a file lock (`recipe_cache.json.lock`, next to the file) and writes the file atomically, so parallel batch workers do not damage it.

See [Verification](/atesor/docs/architecture/verification/) for the scan that decides the verdict.

### What does performance mode add?

After a native run with `--optimize`, Atesor adds the result of [performance mode](/atesor/docs/guides/optimize/) to the entry of the verified build, under `optimizations`. The key is the core name of the machine, else its ISA label, so results from different boards stay apart. Each result has the date, the machine, the status, the accepted tune, its time ratio and the workload. An accepted tune also has its settings: the compiler, the flags and the environment.

- Atesor stores only a native result with a workload and the status `accepted` or `no gain`. It never stores a QEMU result.
- Atesor adds a result only to an entry that exists. A result never makes a new entry.

## How does a cache hit work?

A run with `--repo`, and without `--force` or `--optimize`, checks the cache before the API key check and before sandbox setup:

1. Atesor looks up the package name and the sandbox key of the run, and compares the URL.
2. It writes `<repo>_recipe.md` to the output directory. When the entry holds `recipe_markdown`, the file is that text. Else Atesor makes a recipe from the stored fields, with a note to run again with `--force`.
3. It prints the build system, the last build time, the source commit and the path of the recipe file.
4. It exits. The run clones nothing, builds nothing and calls no LLM.

The exit code depends on the verdict that the entry holds:

| Entry | Console | Exit code |
|---|---|---|
| Verified verdict | `CACHED (not rebuilt): recipe for '<repo>' from an earlier verified run` | 0 |
| No verified verdict | `CACHED (not rebuilt), NOT VERIFIED: recipe for '<repo>'; ...` | 3 |

An entry without a verified verdict comes from an older version of Atesor, for example from a time before verification existed. Run again with `--force` to build and verify the package. `--package` does nothing on a cache hit, because no fresh source tree exists to package.

### How does `--optimize` use the cache?

Performance mode needs a real build tree, so `--optimize` skips the cache hit. When the cache has an entry with a verified verdict, Atesor builds the package again with the cached build plan and patches, and makes no planning LLM call. `--force` makes Atesor plan again. Atesor does not use an entry without a verified verdict.

## How do I bypass or clear the cache?

Pass `--force` to ignore the cache for one run. Atesor then runs the full pipeline. If the new port is verified, its entry replaces the old one.

```bash
atesor-ai --repo https://github.com/madler/zlib --force
```

`batch_test.py` always passes `--force` to each run, so batch runs never use the cache.

No flag clears the cache. `--clean-workspace` does not touch it, because the cache is in `data/` and not in the workspace. To remove one package, delete its key from `packages` in the JSON file. When the file is missing at start, Atesor copies the cache file that ships with Atesor. If no such file exists, Atesor writes an empty cache.

## Where does the cache live?

The cache is in `<state home>/data/recipe_cache.json`. Atesor selects the state home in this order:

1. `ATESOR_HOME`, when you set it.
2. `/workspace`, when Atesor itself runs inside a container.
3. The source checkout, when you run from a writable clone.
4. `$XDG_DATA_HOME/atesor-ai`, by default `~/.local/share/atesor-ai`.

The source repository also ships a `data/recipe_cache.json`. The `.gitattributes` file of the repository stops git from a line-by-line merge of this file. To merge two versions by meaning, run `sh .github/scripts/setup_git_merge_driver.sh` one time in your clone, or use `.github/scripts/merge_data_artifacts.py --merge-caches`. In both cases, the newest recipe of each package and sandbox wins.

## What is the few-shot store?

The few-shot store is a second learned data set in `data/examples/`. It has one JSON file for each of three agent roles: `scout_examples.json`, `fixer_examples.json` and `builder_examples.json`. The file `supervisor_examples.json` is a legacy file that no code reads. Atesor writes new examples at the same time as the cache entry, only after a verified port:

- a scout example with the build plan,
- a fixer example for each fix that worked,
- a builder example with the build phases.

Atesor puts the examples that match best into the scout and fixer prompts. It first removes examples from another sandbox. Then it scores the rest, for example by build system, error pattern and tags. Each file keeps at most 100 examples. When a file is full, Atesor removes the oldest auto-learned examples first and keeps the manual examples. The few-shot sandbox key has no `-native` suffix, so native and QEMU runs share examples. They do not share recipe cache entries.

See [LLM layer](/atesor/docs/architecture/llm-layer/) for how the prompts use the examples, and [Few-shot examples](/atesor/docs/contributing/few-shot-examples/) to add your own.
