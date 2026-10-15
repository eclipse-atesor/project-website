---
title: Releases
description: The two kinds of Atesor release on GitHub, the atesor-ai application package and the monthly package builds, and how to check a download.
sidebar:
  order: 1
---

Eclipse Atesor™ publishes two kinds of release on [GitHub](https://github.com/eclipse-atesor/atesor/releases). An application release holds the `atesor-ai` Debian package. A monthly build release holds the packages that the CI workflows ported to riscv64, each zip with its recipe.

## Which releases exist?

On 2026-10-15, the release list holds these entries:

| Kind | Tag | Title | Published |
| --- | --- | --- | --- |
| Application | `v0.2.0` | atesor-ai 0.2.0 | 2026-10-01 |
| Monthly builds | `builds-2026-10`, `builds-2026-10-01` to `builds-2026-10-03` | October 2026 builds, builds 01 to 03 | from 2026-10-01 |
| Monthly builds | `builds-2026-09` | September 2026 builds | 2026-09-08 |
| Monthly builds | `builds-2026-08` | August 2026 builds | 2026-08-04 |
| Monthly builds | `builds-2026-07`, `builds-2026-07-01` | July 2026 builds, builds 01 | from 2026-07-02 |
| Monthly builds | `builds-2026-06`, `builds-2026-06-01`, `builds-2026-06-02` | June 2026 builds, builds 01 and 02 | from 2026-06-04 |
| Earlier | `beta` | atesor-v1.2.0 | 2026-06-17 |
| Earlier | `v1.0-beta` | atesor-v1.0.0 | 2026-04-23 |

The two earlier releases have no assets. Their notes describe a setup from the source tree.

## Which features are on main but not in v0.2.0?

`v0.2.0` is the latest application release. On 2026-10-15, two features came to `main` after it:

- Performance mode (`--optimize`). See [Performance mode](/atesor/docs/guides/optimize/).
- The Anthropic LLM provider (`LLM_PROVIDER=anthropic`). See [Configure the LLM](/atesor/docs/getting-started/configure-llm/).

The `v0.2.0` package does not include them. To use them, run Atesor from a source checkout. See [Development setup](/atesor/docs/contributing/development-setup/).

## What is an application release?

An application release holds the Debian package of the `atesor-ai` command. The `v0.2.0` release has two assets:

- `atesor-ai_0.2.0_amd64.deb`
- `atesor-ai_0.2.0_amd64.deb.sha256`

The release notes say that the workflow built the package from commit `38d85b4da4c751626e54e73efac157f430ef9360` on `ubuntu:22.04`. `packaging/deb/README.md` says that the package targets Ubuntu 22.04 and Debian-based systems with `python3.10`. The build container sets the architecture, so the `v0.2.0` package is for `amd64`.

The `Package .deb` workflow (`.github/workflows/package-deb.yml`) makes an application release when a maintainer pushes a tag of the form `vX.Y.Z` or `vX.Y.Z-<suffix>`. The workflow does these steps:

1. It takes the version from the tag (`v0.2.0` gives `0.2.0`) and writes it into `src/__init__.py`.
2. It runs the test suite with `PYTHONPATH=. python3 -m pytest -q`.
3. It runs `python3 -m flake8 main.py src/ tests/ .github/scripts/`.
4. It builds the package with `packaging/deb/build_deb.sh`.
5. It checks the package with `packaging/deb/validate_deb.sh`, which runs 9 checks in a clean container.
6. It writes the SHA-256 file and the release notes, and publishes the release.

To install the package, see [Install](/atesor/docs/getting-started/install/).

## How do you check the application package?

1. Download the `.deb` file from the [v0.2.0 release](https://github.com/eclipse-atesor/atesor/releases/tag/v0.2.0).
2. Calculate the SHA-256 value:

   ```bash
   sha256sum atesor-ai_0.2.0_amd64.deb
   ```

3. Compare the value with the `SHA256` line in the release notes. The `.sha256` asset holds the same value. The workflow wrote that file in the `dist/` directory, so the file name in it starts with `dist/`. For this reason, `sha256sum -c` looks for the package in `dist/`.
4. After the install, check the version:

   ```bash
   atesor-ai --version
   ```

   The command prints `atesor-ai 0.2.0`.

5. Check the installed files against the checksums in the package:

   ```bash
   dpkg -V atesor-ai
   ```

   `packaging/deb/README.md` says that the build writes `DEBIAN/md5sums`, so that `dpkg -V` can check each installed file.

## What is a monthly build release?

A monthly build release holds zip files of packages that the batch workflows ported to riscv64. The `release-zips` action (`.github/actions/release-zips/action.yml`) publishes them with these rules:

- The tag is `builds-YYYY-MM`, and the title is `<Month YYYY> builds`.
- GitHub limits a release to 1000 assets. When the release for the month is full, the action continues in an overflow release `builds-YYYY-MM-NN`, with the title `<Month YYYY> builds NN`. `NN` starts at `01`.
- Each new month starts again with the base tag.
- Each repository has one zip for each platform in a month. Before an upload, the action deletes older zips of the same repository and platform from all releases of that month.
- The file name is `<owner>-<repo>-<YYYYMMDD>-<HHMMSS>-<platform>.zip`. The platform is `alpine` or `debian`.

The `ATESOR AI Batch Porting Tests` workflow (`batch-port.yml`) and the `batch-port-retry` workflow upload the zips. The batch workflow runs a full sweep on both platforms each Saturday at 01:17 UTC. It also runs one on the first day of each month at 01:07 UTC. Maintainers can also start it by hand. A full run skips the packages that a release of the current month already holds for that platform, unless the run sets the `force_all` input. The retry workflow runs after each batch run and builds the packages that the batch run did not produce.

The [package index](/atesor/downloads/) on this site lists the packages of the monthly build releases.

## What is in a package zip?

`src/packager.py` writes each zip with this layout:

```text
<owner>-<repo>-<YYYYMMDD>-<HHMMSS>-<platform>.zip
├── build_recipe.md     the porting recipe
├── manifest.json       the verification verdict and the riscv64 outputs
├── <repo>.log          the batch log of the package, if there is one
├── agent_<repo>.log    the debug log of the run, if there is one
├── optimized/          the files of the accepted tune (--optimize only)
└── <repo>/             the source tree, without .git/ and symbolic links
```

For a run without `--optimize`, `src/packager.py` writes `"schema_version": 2` in `manifest.json`, with these main fields:

| Field | Content |
| --- | --- |
| `repo_url`, `platform`, `created_at` | Where the source came from, the sandbox and the time of the zip |
| `verification.status` | The verdict of the artifact scan |
| `verification.verified` | `true` only when the scan proved riscv64 output |
| `verification.source_commit` | The commit of the source that the build used |
| `artifacts` | One entry for each riscv64 output: `path`, `type`, `arch`, `abi`, `size`, `in_zip`, and for a file in the zip, `path_in_zip` and `sha256` |
| `package_tests` | The result of the package tests. These tests never decide the port. |

A run with `--optimize` writes `"schema_version": 3`. It adds a `machine` section and an `optimization` section. When Atesor accepts a tune, the zip also holds the `optimized/` folder. The batch workflows do not pass `--optimize`, so the zips of the monthly build releases use schema 2.

For the verdicts, see [Verification](/atesor/docs/architecture/verification/). For the output files of a local run, see [Output files](/atesor/docs/reference/output-files/).

## How do you check a package zip?

The release notes of the monthly builds give no check procedure. The manifest gives you the data for one:

1. Download the zip from the release, or find it in the [package index](/atesor/downloads/).
2. Extract the zip:

   ```bash
   unzip <owner>-<repo>-<YYYYMMDD>-<HHMMSS>-<platform>.zip -d port
   ```

3. Read `port/manifest.json`. Make sure that `verification.verified` is `true`. A zip can come from a build whose commands passed but that proved no riscv64 output. For that build, `verified` is `false`.
4. For each entry in `artifacts` with `"in_zip": true`, calculate the SHA-256 value of the file and compare it with `sha256`:

   ```bash
   sha256sum port/<repo>/<path_in_zip>
   ```

An output that the build installed outside the source tree, for example in `/usr/local/bin`, has `"in_zip": false` and no `sha256` value.
