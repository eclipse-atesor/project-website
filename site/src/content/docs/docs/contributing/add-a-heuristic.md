---
title: Add a recovery heuristic
description: Add an LLM-free recovery step to the Atesor builder in src/graph.py, follow the pattern of the existing steps, and test it without Docker.
sidebar:
  order: 4
---

A recovery heuristic is a fixed rule in the builder of Eclipse Atesor™. It finds a known failure in the output of a build command, runs a repair, and runs the build command again. It makes no LLM call, so it also works when the LLM provider is rate-limited. This page shows where the heuristics are, the pattern that they follow, and how to test a new one.

## Where are the heuristics?

All heuristics are in `builder_node()` in `src/graph.py`. Their helper functions are module-level functions above `builder_node()`. For the full list with the trigger, the action and the limit of each heuristic, see [Recovery heuristics](/atesor/docs/architecture/recovery-heuristics/).

`builder_node()` has two kinds of heuristic:

- **Rewrites before a command runs.** The builder changes `optimized_cmd`, the copy of the command that it runs. Examples: the autotools bootstrap when the repository has no committed `./configure`, and the redirect of `make` to the directory that holds the makefile.
- **Retries after a command fails.** These are in the `if not result.success:` block. Each retry checks the output of the failed command, runs a repair, and runs the command again.

The builder checks the retries in code order. A specific signature must come before a generic one. For example, the suspected-OOM check matches any exit code 137, so a retry for a specific exit-137 failure must come before it.

## Which pattern does a retry follow?

Most retries use the same steps. This template shows them. Replace the `<...>` parts and the helper name:

```python
# In builder_node(), inside `if not result.success:`,
# before the code writes the error record.
if "<signature>" in (result.stderr or "").lower() and (
    _builder_retry_allowed(state, f"<key>:{command}")
):
    retry_command = _my_repair_command(optimized_cmd)
    retry_result = execute_command(retry_command, cwd=state.repo_path)
    state.cache_command_result(retry_command, retry_result)
    state.log_scripted_op("retry_build_command")
    if retry_result.success:
        logger.info("Resolved <failure> by <repair>")
        phase.commands[phase.commands.index(command)] = retry_command
        continue
    result = retry_result
```

Each line has a reason:

1. **The signature check.** Match a text that only this failure prints. Read `result.stderr`, and use `result.exit_code` when the text is not enough.
2. **`_builder_retry_allowed(state, key)`.** The function stores the key in `state.context_cache["builder_retry_keys"]` and returns `True` only the first time. Put the command in the key, so the retry runs one time for each command in the whole run. Some older retries do not use this guard. Use it in each new retry.
3. **`execute_command()`.** Each shell command uses this function. It runs the command in the sandbox and applies the `CommandValidator` whitelist.
4. **`state.cache_command_result()` and `state.log_scripted_op()`.** The result goes in the command cache. The operation goes in the audit trail and in the count of scripted operations in the report. Performance mode (`--optimize`) reads the command cache to find the command that really ran for each plan command. It runs these commands again for the baseline and for each tune.
5. **`phase.commands[...] = retry_command`.** On success, the builder writes the repaired command into the build plan. The recipe cache and the learned examples then hold the command that worked. A retry that installs a package and then runs the same command again leaves `phase.commands` unchanged.
6. **`continue`.** The builder goes to the next command.
7. **`result = retry_result`.** On failure, the later retries and the error record see the newest output.

When no retry succeeds, the builder writes an error record with the category from `classify_error()` in `src/state.py`, sets `build_status` to `FAILED`, and returns. While attempts remain, the LLM fixer then gets the error.

## Which rules apply to the repair command?

- Use `get_active_profile()` from `src/platforms.py` for package names and install commands. `profile.install_cmd(packages)` and `profile.resolve(name)` give the distro form. Do not hardcode `apk` or `apt-get`.
- Keep the command inside the `CommandValidator` whitelist. In `builder_node()`, only the Go toolchain download calls `execute_command(..., validate=False)`. Its comment gives the reason: the code builds that command from a checked version, not from LLM text.
- Use two paths when the heuristic reads files. `_to_host_path(state.repo_path)` gives the host path for a file check. Commands that run in the sandbox need the container path under `/workspace`.
- Go build commands keep `-buildvcs=false`.
- Log the event. Most existing retries write a `logger.warning()` line when they fire and a `logger.info()` line when they succeed.

## How do you test a heuristic?

Test the helper function first. Then test the code in `builder_node()` that calls it. The tests need no Docker and no LLM.

1. Put the detection and the command rewrite in small helper functions. Examples are `_is_suspected_oom()`, `_serialize_build_command()` and `_resolve_header_to_packages()`.
2. Test each helper in `tests/test_graph_validators.py`. The classes `TestSuspectedOOM`, `TestSerializeBuildCommand`, `TestHeaderResolution` and `TestBuilderRetryAllowed` are models.
3. If `execute_command()` validates the repair command, check that the validator accepts it. `TestAutotoolsBootstrap.test_bootstrapped_commands_pass_the_validator` in `tests/test_masterplan_fixes.py` does this with `CommandValidator().is_safe(command)`.
4. Test the code in `builder_node()` with a fake `execute_command`. `TestBuilderCMakeCacheCleanup` in `tests/test_graph_agents.py` is the model. It makes a `BuildPlan` with one phase, patches `graph.execute_command`, `graph._to_host_path` and `graph.predict_build_issues`, calls `graph.builder_node(state)`, and checks the list of commands that ran.
5. Run the tests:

```bash
PYTHONPATH=. pytest tests/test_graph_validators.py tests/test_graph_agents.py tests/test_masterplan_fixes.py
```

## Does the failure also need a new error category?

A heuristic repairs a failure. An error category tells the supervisor how to react when no repair works. To add a category pattern, add a branch to `classify_error()` in `src/state.py`. The order matters: put a specific pattern before a generic one. Add a test for the pattern in `tests/test_state.py`.

For the rules that each change must keep, see [Development setup](/atesor/docs/contributing/development-setup/). For the scripted analysis that runs before the build, see [Scripted operations](/atesor/docs/architecture/scripted-ops/).
