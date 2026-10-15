---
title: Governance
description: How the Atesor project is governed as an Eclipse Foundation incubation project under the OpenHW Group, and how to contribute and communicate.
sidebar:
  order: 3
---

Eclipse Atesor™ is an Eclipse Foundation project in incubation, under the OpenHW Group. The code is under the MIT licence. This page tells you who makes decisions, how you can contribute or become a committer, and where the project communicates.

## What is the status of the project?

- **Foundation**: Atesor is a project of the Eclipse Foundation. The project ID is `openhw.atesor`.
- **Parent**: the project is under the OpenHW Group.
- **Phase**: incubation. The [Eclipse Foundation Project Handbook](https://www.eclipse.org/projects/handbook/) describes the phases of a project.
- **Licence**: MIT. The `LICENSE` file is in the root of the [source repository](https://github.com/eclipse-atesor/atesor), and each module in `src/` carries the header `SPDX-License-Identifier: MIT`.

The official project data is on the project pages of the Eclipse Foundation:

- [Project page](https://projects.eclipse.org/projects/openhw.atesor)
- [Who is involved](https://projects.eclipse.org/projects/openhw.atesor/who)

## Who makes decisions?

Atesor follows the Eclipse Foundation Development Process, like each Eclipse project. The handbook describes the process and the roles:

- **Committers** have write access to the project repositories. They review contributions and merge them.
- **Project leads** lead the project and represent it in the Eclipse Foundation processes.

The [Who is involved](https://projects.eclipse.org/projects/openhw.atesor/who) page lists the current project leads and committers.

## How do you contribute?

Any person can contribute through a pull request. `CONTRIBUTING.md` lists these ways to help:

- Port a package and submit the recipe.
- Add a new platform profile. See [Add a platform](/atesor/docs/contributing/add-a-platform/).
- Improve the error classification in `classify_error()` in `src/state.py`.
- File a bug report for a package that fails in a repeatable way.
- Improve prompts, tests or documentation. See [Change the docs](/atesor/docs/contributing/docs/).

To prepare a checkout and submit a change, see [Development setup](/atesor/docs/contributing/development-setup/). The handbook describes what the Eclipse Foundation asks of each contributor.

## How do you become a committer?

The existing committers of an Eclipse project elect new committers. The [Eclipse Foundation Project Handbook](https://www.eclipse.org/projects/handbook/) describes the election and what a nominee needs.

## Where does the project communicate?

| Channel | Use |
| --- | --- |
| [atesor-dev mailing list](https://accounts.eclipse.org/mailing-list/atesor-dev) | Development discussion |
| [GitHub issues](https://github.com/eclipse-atesor/atesor/issues) | Bug reports and other problems |
| [Pull requests](https://github.com/eclipse-atesor/atesor/pulls) | Code and data changes |
| [project-website](https://github.com/eclipse-atesor/project-website) | Changes to the website and these docs |

## What does a bug report contain?

`CONTRIBUTING.md` asks for these items when a package fails to build:

- The exact `main.py` command.
- The URL of the package.
- The sandbox profile: `alpine` or `debian`.
- The related part of `workspace/logs/agent_{repo}.log`.
- The related part of `workspace/logs/agent-call_{repo}.log`, the LLM transcript.
- The `AgentState` snapshot from `workspace/output/{repo}_state_*.json`, if there is one.

For other problems, open an issue with the steps that show the problem again.

For the origin of the name, see [About the name](/atesor/docs/project/name/).
