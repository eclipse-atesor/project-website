---
title: Architecture overview
description: The LangGraph state graph in src/graph.py, with its 13 nodes, 9 routing functions, the build-verify-fix subgraph, finish, performance mode and escalation.
sidebar:
  order: 1
---

Eclipse Atesor™ runs each port as a LangGraph state graph in `src/graph.py`. The graph has 13 nodes and 9 routing functions, and 5 nodes can call an LLM. Read this page to know which node runs when, and why a run finishes or escalates.

## What is the state graph?

LangGraph is a Python library that runs a graph of functions over one shared state object. Atesor builds a `StateGraph(AgentState)` in `create_workflow()`. Each node is a Python function that receives the `AgentState`, changes it, and returns it. A routing function reads the state after a node and returns the name of the next node.

The build, verify and fix steps form a separate compiled graph, the subgraph, from `create_build_fix_subgraph()`. The parent graph uses the compiled subgraph as one node, `build_fix_subgraph`.

`main.py` runs the graph with `app.stream(initial_state, config={"recursion_limit": 120})`. The real limit on a run is `max_attempts` (default 5, flag `--max-attempts`) and the cost limit. See [Agent state](/atesor/docs/architecture/agent-state/) for both checks.

## How many nodes and routing functions are there?

These counts come from `create_workflow()` and `create_build_fix_subgraph()` on `main`:

- The parent graph registers 10 nodes. One of them is the compiled subgraph.
- The subgraph registers 3 nodes.
- The total is 13 registered nodes, backed by 12 node functions and 1 compiled subgraph.
- There are 9 routing functions: 6 in the parent graph and 3 in the subgraph.
- The parent graph also has 4 fixed edges: `scout_node` to `supervisor_node`, `build_fix_subgraph` to `supervisor_node`, `optimize_node` to `END`, and `escalate_node` to `END`.
- Two nodes run only with `--optimize`: `cached_recipe_node` and `optimize_node`.

| Node | Graph | Calls an LLM | What it does |
|---|---|---|---|
| `init_node` | parent | No | Clones or updates the repository and runs the scripted analysis. |
| `cached_recipe_node` | parent | No | With `--optimize`, turns a verified recipe cache entry into the build plan. |
| `analyst_node` | parent | Yes, planner role | Reads build files and docs, and writes a `PackageAnalysis`. |
| `heuristic_plan_node` | parent | No | Writes a default `BuildPlan` when it is safe. |
| `scout_node` | parent | Yes, scout role | Writes a custom `BuildPlan` from the evidence. |
| `supervisor_node` | parent | No | Logs a summary. Its routing function picks the next node. |
| `build_fix_subgraph` | parent | Through `fix_node` | Runs the build, verify and fix loop. |
| `finish_node` | parent | Yes, summarizer role | Runs package tests, writes the recipe, and saves learning data. |
| `optimize_node` | parent | Yes, planner and builder roles | Runs performance mode after a finished port. |
| `escalate_node` | parent | No | Writes the escalation report. |
| `build_node` (`builder_node`) | subgraph | No | Runs the plan commands and the recovery heuristics. |
| `verify_node` | subgraph | No | Reads the ELF header of every build output. |
| `fix_node` (`fixer_node`) | subgraph | Yes, fixer role | Proposes one fix strategy and applies it. |

`finish_node` can make two LLM calls: one for the recipe and one for the artifact curator. Both use the summarizer role. `optimize_node` calls a model only when the workload of performance mode comes from the optimizer agent. `cached_recipe_node` runs under the `planner` role label, but it makes no LLM call. The model for each role is on the [LLM layer](/atesor/docs/architecture/llm-layer/) page.

## What does the flow look like?

The picture shows the parent graph, the subgraph, and the steps before and after the graph. The text diagrams after it give each routing condition.

<figure class="diagram">
  <a class="diagram-light" href="/atesor/docs/diagrams/architecture-light.svg"><img src="/atesor/docs/diagrams/architecture-light.svg" width="780" height="1153" alt="Atesor architecture. main.py checks the URL, the recipe cache, the API key and the riscv64 sandbox. A cache hit writes the recipe and stops. Otherwise the LangGraph state graph runs init_node, analyst_node, heuristic_plan_node or scout_node, and supervisor_node. The supervisor routes to the build_fix_subgraph (build_node, verify_node, fix_node), to finish_node and optimize_node, or to escalate_node. A verified port goes into the recipe cache and the few-shot examples." /></a>
  <a class="diagram-dark" href="/atesor/docs/diagrams/architecture-dark.svg"><img src="/atesor/docs/diagrams/architecture-dark.svg" width="780" height="1153" alt="Atesor architecture. main.py checks the URL, the recipe cache, the API key and the riscv64 sandbox. A cache hit writes the recipe and stops. Otherwise the LangGraph state graph runs init_node, analyst_node, heuristic_plan_node or scout_node, and supervisor_node. The supervisor routes to the build_fix_subgraph (build_node, verify_node, fix_node), to finish_node and optimize_node, or to escalate_node. A verified port goes into the recipe cache and the few-shot examples." /></a>
  <figcaption>Open the picture to see it at full size.</figcaption>
</figure>

The parent graph:

```text
atesor-ai --repo <url>
  |
  |-- recipe cache hit, without --optimize and without --force
  |     (main.py, before the graph runs)
  |     write <repo>_recipe.md, exit 0 (verified) or 3 (not verified)
  |
  |-- --optimize without --force: main.py puts a verified
  |     cache entry into state.cached_recipe
  v
init_node ............................... no LLM
  |  route_init_to_next
  |-- FAILED or ESCALATED ---------------------------> escalate_node --> END
  |-- cached_recipe is set --> cached_recipe_node ... no LLM
  |                              |  route_cached_recipe_to_next
  |                              |-- build_plan is set --> supervisor_node
  |                              |-- no build_plan ------> analyst_node
  v
analyst_node ............................ LLM (planner role)
  |  route_analyst_to_next
  |-- no package_analysis ---------------------------> escalate_node --> END
  v
heuristic_plan_node ..................... no LLM
  |  route_heuristic_plan_to_next
  |-- no build_plan --> scout_node ...... LLM (scout role)
  |                        |
  v                        v
supervisor_node ......................... no LLM  <------------------+
  |  route_supervisor_to_next                                       |
  |-- SUCCESS -----------------------------> finish_node            |
  |-- ESCALATED, or an escalation check ---> escalate_node --> END  |
  |-- no package_analysis -----------------> analyst_node           |
  |-- FAILED and a new plan is needed -----> scout_node             |
  |-- FAILED, or plan PENDING / BUILDING --> build_fix_subgraph ----+
  |-- all other states --------------------> scout_node

finish_node ............................. LLM (summarizer role)
  |  route_finish_to_next
  |-- optimize_requested (--optimize) -----> optimize_node --> END
  |-- all other states --------------------> END

optimize_node ........................... LLM (planner and builder roles),
                                          only for a workload from the agent
```

The subgraph:

```text
build_fix_subgraph (entry point: build_node)

build_node ........ no LLM
  |  route_build_result
  |-- SUCCESS ------------------------------> verify_node
  |-- ESCALATED, or no attempts remain -----> __end__
  |-- all other states ---------------------> fix_node

verify_node ....... no LLM
  |  route_verify_result
  |-- SUCCESS or ESCALATED -----------------> __end__
  |-- no attempts remain -------------------> __end__
  |-- a fix exists and the error category
  |   is not LINKING, COMPILATION or
  |   ARCHITECTURE -------------------------> __end__
  |-- all other states ---------------------> fix_node

fix_node .......... LLM (fixer role)
  |  route_fix_result
  |-- ESCALATED or FAILED ------------------> __end__
  |-- no attempts remain -------------------> __end__
  |-- all other states ---------------------> build_node

__end__ returns control to supervisor_node in the parent graph.
```

## What does each routing function decide?

**`route_init_to_next`** sends the run to `escalate_node` when `build_status` is `FAILED` or `ESCALATED`. A failed clone sets `FAILED`. When `cached_recipe` is set, the run goes to `cached_recipe_node`. Otherwise the run goes to `analyst_node`.

**`route_cached_recipe_to_next`** sends the run to `supervisor_node` when `cached_recipe_node` wrote a `build_plan`. Otherwise the run goes to `analyst_node` and plans as usual.

**`route_analyst_to_next`** sends the run to `escalate_node` when `package_analysis` is `None`. The analyst always writes an analysis, from the LLM or from its deterministic fallback, so `None` means the node crashed. Otherwise the run goes to `heuristic_plan_node`.

**`route_heuristic_plan_to_next`** sends the run to `supervisor_node` when a `build_plan` exists. Otherwise the run goes to `scout_node`.

**`route_supervisor_to_next`** makes no LLM call. It checks these conditions in this order and returns the first match:

1. `build_status` is `SUCCESS`: go to `finish_node`. This is true also at the attempt or cost limit.
2. `build_status` is `ESCALATED`: go to `escalate_node`.
3. `should_escalate(state)` returns true: go to `escalate_node`.
4. `attempt_count` is `max_attempts` or more: go to `escalate_node`.
5. `attempt_count` is 3 or more and the last 3 errors have one signature: go to `escalate_node`.
6. `package_analysis` is `None`: go to `analyst_node`.
7. `build_status` is `FAILED` and a new plan is needed: go to `scout_node`.
8. `build_status` is `FAILED`: go to `build_fix_subgraph`.
9. A `build_plan` exists and `build_status` is `PENDING` or `BUILDING`: go to `build_fix_subgraph`.
10. In all other states: go to `scout_node`.

A new plan is needed when the last error category is `DEPENDENCY` or `MISSING_TOOLS`. A new plan is also needed one time for each of 6 error signatures, for example `unable to locate package` or `./configure: no such file or directory`. The [recovery heuristics](/atesor/docs/architecture/recovery-heuristics/) page lists all 6.

**`route_finish_to_next`** sends the run to `optimize_node` when `optimize_requested` is true, which only `--optimize` sets. Otherwise the run ends. `optimize_node` itself skips a port that is not verified, so the report always gives the reason.

**`route_build_result`** sends a `SUCCESS` build to `verify_node`. It ends the subgraph on `ESCALATED` or when `attempt_count` reaches `max_attempts`. Otherwise it sends the run to `fix_node`.

**`route_verify_result`** ends the subgraph on `SUCCESS` or `ESCALATED`, or when no attempts remain. It also ends the subgraph when a fix exists and the last error category is not `LINKING`, `COMPILATION` or `ARCHITECTURE`. Otherwise it sends the run to `fix_node`. `verify_node` sets `FAILED` only for a wrong-architecture verdict, with category `ARCHITECTURE`, so that verdict goes to the fixer while attempts remain.

**`route_fix_result`** ends the subgraph on `ESCALATED` or `FAILED`, or when no attempts remain. Otherwise it sends the run to `build_node` again.

## Which plan does the build use?

`heuristic_plan_node` writes a default plan with no LLM call. It does this only for `cmake`, `make`, `autotools` and `go`, and only when all of these conditions are true:

- The analyst did not set `needs_custom_plan` in an LLM-grounded analysis.
- The architecture scan found no `critical` finding and fewer than 3 `high` findings.
- The build-system confidence is 0.5 or more.

The analyst's build system can replace the detected one. This happens when the analysis is LLM-grounded, the analyst type is not `unknown`, and its confidence is the same or higher. The default plan installs the dependencies that the analyst and the scripted detection found, if each name is in the platform package map. In all other cases the LLM scout writes the plan. If the scout fails, `create_fallback_build_plan()` writes a fixed plan for the detected build system.

With `--optimize` and without `--force`, a verified recipe cache entry replaces the planning steps. `cached_recipe_node` does these steps:

1. It builds the `BuildPlan` from the phases and commands of the cached entry.
2. It writes a `PackageAnalysis` with `llm_grounded=False`. The expected artifacts come from the cached artifact names.
3. It applies the cached patches. A patch that does not apply is only a warning, and the build decides.
4. It logs a note when the current commit is not the commit that the entry verified.

The analyst and the scout make no LLM call in this path. A failed build still goes to the fixer and the normal re-plan loop. When the cached entry has no command, the node clears `cached_recipe` and the run plans as usual.

## How do nodes handle exceptions?

Every node function has the `@agent_node(AgentRole.X)` decorator. The decorator does three things:

1. It sets `state.current_agent` to the role.
2. When the exception text looks like a rate limit, for example `429`, `quota exceeded` or `402`, it runs the node again. A node runs 3 times at most. The wait before a new run is `30 * 2**attempt` seconds plus up to 15 seconds of random jitter.
3. For any other exception, or a third rate-limit failure, it adds an error record, sets `build_status` to `ESCALATED`, and returns the state.

The routing functions then send an `ESCALATED` run to `escalate_node`. The run does not return to the scout or the fixer, because an LLM cannot repair an infrastructure fault.

`optimize_node` is the exception to this rule. It catches every exception itself and writes it to `state.optimization` with the status `error`. A performance mode failure therefore never escalates a finished port, and the rate-limit retry never runs the measurements a second time.

## What happens at the finish?

`supervisor_node` routes every `SUCCESS` to `finish_node`, verified or not. `finish_node` does these steps:

1. It sets `build_status` to `SUCCESS`.
2. It runs the package's own tests one time. The result never changes the build status.
3. It asks the summarizer model for the recipe. If that call fails, it writes a short fallback recipe with the build steps and the verification verdict.
4. It ranks the build outputs with the artifact curator.
5. If the build is verified, it saves few-shot examples and a recipe cache entry. If the build is not verified, it saves nothing.

With `--optimize`, `route_finish_to_next` then sends the run to `optimize_node`. See [Performance mode internals](/atesor/docs/architecture/optimize/).

`main.py` then writes the outputs and exits with 0 for a verified port, or 3 when no riscv64 output is proven. With `--package`, a packaging failure gives exit code 2. Performance mode never changes the exit code. See [Verification](/atesor/docs/architecture/verification/) for the verdicts.

## What happens at an escalation?

`escalate_node` makes no LLM call. It sets `build_status` to `ESCALATED` and writes an escalation report into `context_cache["escalation_report"]`. The report has these parts:

- A summary: repository, status, attempts, cost and duration.
- The last error, with its category and severity.
- The last 5 fix attempts.
- Up to 5 `high` or `critical` architecture findings.
- A recommendation from `should_escalate()`.
- The last 5 error records.

`main.py` then prints the last error and the last 10 audit events, and exits with 1. See [Exit codes](/atesor/docs/reference/exit-codes/).

## Related pages

- [Agent state](/atesor/docs/architecture/agent-state/)
- [Scripted operations](/atesor/docs/architecture/scripted-ops/)
- [Recovery heuristics](/atesor/docs/architecture/recovery-heuristics/)
- [Verification](/atesor/docs/architecture/verification/)
- [LLM layer](/atesor/docs/architecture/llm-layer/)
- [Performance mode internals](/atesor/docs/architecture/optimize/)
