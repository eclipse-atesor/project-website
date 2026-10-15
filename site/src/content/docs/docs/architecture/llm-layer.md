---
title: LLM layer
description: Providers and models, JSON validation with fallbacks, prompts and knowledge, the analyst, the fixer, the optimizer agent, few-shot memory and the LLM audit log.
sidebar:
  order: 6
---

Eclipse Atesor™ uses an LLM in 5 graph nodes: the analyst, the scout, the fixer, the finish node and the optimize node. This page describes model selection, response checks, fallbacks, prompts, few-shot learning and the call log.

## Which providers does Atesor support?

On `main`, `src/models.py` supports 4 providers. The `LLM_PROVIDER` environment variable selects one. The default is `gemini`.

| `LLM_PROVIDER` | API key variable | Client class |
|---|---|---|
| `gemini` (default) | `GOOGLE_API_KEY` | `ChatGoogleGenerativeAI` |
| `openai` | `OPENAI_API_KEY` | `ChatOpenAI` |
| `openrouter` | `OPENROUTER_API_KEY` | `ChatOpenAI` with the OpenRouter base URL |
| `anthropic` | `ANTHROPIC_API_KEY` | `ChatAnthropic` from the `langchain-anthropic` package |

`check_api_keys()` fails when the key is missing or is the placeholder `your_key_here`. It also fails for an unknown provider name. For `anthropic`, it also fails when the `langchain-anthropic` package is not installed. `requirements.txt` lists that package. See [Configure the LLM](/atesor/docs/getting-started/configure-llm/).

Two more variables apply to all providers:

- `ATESOR_MAX_OUTPUT_TOKENS` sets the output token cap. The default is 8192. For `anthropic`, the cap also covers the thinking tokens of the reply.
- `ATESOR_LLM_TIMEOUT` sets the HTTP timeout in seconds. The default is 120.

`invoke_llm()` runs each call in a separate thread with a wall timeout of `ATESOR_LLM_TIMEOUT` plus 15 seconds. The provider timeout therefore fires first and releases the connection. The artifact curator uses a wall timeout of 60 seconds. The optimizer agent uses a wall timeout of 240 seconds for a harness, because a harness is a full source file.

## Which model does each role use?

`MODEL_CONFIG` maps each provider and agent role to a model and a temperature.

| Role | Temperature | `gemini` | `openai` | `openrouter` | `anthropic` (effort) |
|---|---|---|---|---|---|
| `planner` | 0.1 | `gemini-flash-lite-latest` | `gpt-4o` | `openai/gpt-oss-120b:free` | `claude-haiku-5-5` (`medium`) |
| `scout` | 0.1 | `gemini-flash-lite-latest` | `gpt-4o` | `qwen/qwen3-coder:free` | `claude-haiku-5-5` (`medium`) |
| `fixer` | 0.2 | `gemini-flash-lite-latest` | `gpt-4o` | `openai/gpt-oss-120b:free` | `claude-sonnet-5-5` (`medium`) |
| `summarizer` | 0.1 | `gemini-flash-lite-latest` | `gpt-4o-mini` | `meta-llama/llama-3.3-70b-instruct:free` | `claude-haiku-5-5` (`low`) |
| `supervisor` | 0.0 | `gemini-flash-lite-latest` | `gpt-4o-mini` | `qwen/qwen3-coder:free` | `claude-haiku-5-5` (`low`) |
| `builder` | 0.0 | `gemini-flash-lite-latest` | `gpt-4o-mini` | `qwen/qwen3-coder:free` | `claude-sonnet-5-5` (`medium`) |

The `anthropic` entries send no temperature, because both Claude models reject it. Each entry sends an `effort` value instead, as `output_config`. The effort sets the depth of the adaptive thinking of the model. A Claude reply can contain `thinking` parts. `extract_content()` keeps only the `text` parts, so a thinking part cannot break the JSON parse.

These nodes call a model:

- `analyst_node` uses the `planner` role.
- `scout_node` uses the `scout` role.
- `fixer_node` uses the `fixer` role.
- `finish_node` uses the `summarizer` role for the recipe and for the artifact curator.
- `optimize_node` uses the `builder` role when the optimizer agent writes a harness, and the `planner` role when it chooses a program run.

The `supervisor` role has entries, but no node calls a model with it. The supervisor routes by rules. The `builder` role has no model call in the build itself: the builder runs commands, and only the optimizer agent uses the builder model, for harness code.

## How do model fallbacks work?

`create_llm_pool(role)` returns the primary model and its fallbacks. For `gemini`, `openai` and `anthropic`, the pool holds only the primary model.

For `openrouter`, the pool adds these models after the primary, in this order:

1. The models in `OPENROUTER_FALLBACK_MODELS`, a comma-separated list. When it is not set, Atesor uses 6 default free models.
2. `openrouter/free`, the OpenRouter free models router, always last.

The primary model does not appear a second time in the pool.

Each OpenRouter request also carries a `models` array, so OpenRouter can try other models in the same request. The array holds the first 2 named fallbacks and `openrouter/free`, because OpenRouter accepts at most 3 entries.

## How does Atesor validate a JSON response?

The analyst, the scout, the fixer and the optimizer agent use `llm_call_with_validation()` in `src/llm_helpers.py`. The function does not raise for a failed model call. It does these steps for each attempt:

1. It sends the messages to the active model and logs the response.
2. It takes the text from the first `{` to the last `}` and parses it as JSON. The top level must be an object.
3. It runs the node's validator on the object.
4. A valid object ends the call.
5. After a validation failure, it appends a critique message with the reason and asks again.

The nodes and the optimizer agent allow 2 critique retries. Three other failures rotate to the next model in the pool first. They use a critique retry only when no other model remains:

- **Provider error**, for example `404`, `429`, `402`, `rate limit`, `502` or `upstream`.
- **Empty response**.
- **JSON parse failure**.

Some provider errors get special handling:

- **`Retry-After` of 65 seconds or less**: wait one time per model, then try the same model again.
- **HTTP 402 with `can only afford N`**: lower the token cap of every pool model to 90% of N, at least 256, and try the same model again.
- **`use this slug instead: <id>`**: add that model to the pool.
- **`free-models-per-day`**: stop at once. This OpenRouter daily cap covers every free model on the account, so a rotation cannot help.

The total number of attempts is at most the critique retries plus 1, plus the pool size, plus 1 for each added model. The result is an `LLMCallOutcome` with the data, the attempt count, the last error, the token counts and the cost.

The optimizer agent also sets `rotate_on_timeout=True`. A timeout then rotates to the next model in the pool. A timeout on the last model ends the call, because the same model would cost one more full timeout. When no model of the role answers in time, the agent asks the models of the other role one time: the `planner` pool for a harness, and the `builder` pool for a program run.

### What does each validator check?

- **Analyst**: `purpose` is a non-empty string, `build_system` is an object with a `type`, `dependencies` is an array, and `needs_custom_plan` is a JSON boolean.
- **Scout**: `phases` is a non-empty array, and each phase has a `name` and a non-empty list of string commands. `validate_build_plan()` then rejects a build step that hides its failure, such as `make || true`. It also rejects placeholder paths such as `/path/to/`, a guessed `/home/` path and the cross-compiler prefix `riscv64-unknown-linux-gnu-gcc`. It rejects a Go subcommand used as a package name, and `cmake` commands that make a nested build directory. After validation, `scout_node` removes test commands, such as `ctest`, `make check`, `go test` or `cargo test`, because `finish_node` runs the package tests. A plan with only test commands counts as a scout failure.
- **Fixer**: the response has strategies, and the recommended strategy has actions. A `create_file` action needs a path and content, and the path must stay inside the repository. A `patch` path must stay inside the repository. A `command` action must pass `validate_fix_command()`. That function blocks commands such as `rm -rf /`, `git push`, `git reset --hard` and `touch` of a source file. It then applies the single-command check of `CommandValidator`.
- **Optimizer agent**: a program run must name one of the built programs and pass the strict command grammar of `check_workload_command()`. A harness must be a complete source file of at most 32000 bytes. It must print an `ATESOR-CHECK` line and must not use a forbidden call, such as `system`, `rand`, `time.Now` or `std::net::`. A C or C++ harness must call an exported function of the library, a Go file must define `BenchmarkAtesor`, and a Rust example must use the crate. See [Performance mode internals](/atesor/docs/architecture/optimize/).

## What happens when every attempt fails?

Each node has its own fallback, so the run continues when all attempts fail.

| Node | Fallback |
|---|---|
| `analyst_node` | `_fallback_analysis()` builds a `PackageAnalysis` from scripted detection, with `llm_grounded=False`. It sets `needs_custom_plan` when the detection confidence is under 0.5. |
| `scout_node` | `create_fallback_build_plan()` writes a fixed plan for `go`, `cmake`, `make`, `cargo`, `meson` or `autotools`, or a discovery plan. It also records a `Scout failed` error. |
| `fixer_node` | No deterministic fix. It records `FIXER proposed invalid fix` and sets `FAILED`. |
| `finish_node` | A short recipe with the build steps and the verification verdict. |
| Artifact curator | Rule-based ranking. See [Verification](/atesor/docs/architecture/verification/). |
| Optimizer agent | No deterministic answer. That workload source gives no workload, and performance mode tries the next source. |

## How does Atesor count cost?

`cost_for_usage(model_id, input_tokens, output_tokens)` computes the cost from the token usage that the provider reports. A model ID that ends in `:free`, or `openrouter/free`, costs $0. Paid models use this table, in USD per 1 million tokens:

| Model | Input | Output |
|---|---|---|
| `gpt-4o` | 2.50 | 10.00 |
| `gpt-4o-mini` | 0.15 | 0.60 |
| `gemini-flash-lite-latest` | 0.10 | 0.40 |
| `gemini-flash-latest` | 0.30 | 2.50 |
| `claude-haiku-5-5` | 0.10 | 0.50 |
| `claude-sonnet-5-5` | 2.00 | 10.00 |

A paid model that is not in the table uses 3.00 and 12.00, so an unknown model counts high, not free. The tokens of an attempt that fails validation also count. The supervisor escalates the run when `api_cost_usd` is more than $1.00. The calls of the optimizer agent also add to `api_cost_usd`, but they come after `finish_node`, so no escalation check follows them. See [Cost control](/atesor/docs/guides/cost-control/).

## How does Atesor build the prompts?

The prompt templates are in `src/graph.py`: `ANALYST_PROMPT`, `SCOUT_PROMPT`, `FIXER_PROMPT` and `SUMMARIZER_PROMPT`. The curator prompt is in `src/artifact_curator.py`. The optimizer agent prompts are in `src/workload.py`: one for a program run, and one each for a C or C++ harness, a Go benchmark and a Rust example. The analyst, scout, fixer and optimizer prompts ask for JSON only and show the JSON shape of the answer.

The analyst, scout and fixer prompts start with a platform banner from `_build_platform_banner()`. The banner names the distro, the libc, the target triplet and the package manager of the active sandbox. It tells the model never to use the package manager of another distro. It also shows one worked install example and one package name correction.

The scout and fixer prompts also include the static knowledge from `get_system_knowledge_summary()` in `src/knowledge.py`. The active platform profile supplies the distro parts. The block has these parts:

- The install command and the map from canonical names to distro packages.
- 7 RISC-V preprocessor macros, for example `__riscv`, `__riscv_xlen` and `__riscv_vector`.
- 9 common porting issues, each with its root cause and first fix. The issues are x86 intrinsics, inline assembly, builtin functions, memory ordering, musl libc, `config.guess`, atomics linking, the code model and the cache line size. The block skips the musl issue in a glibc sandbox.
- Key facts: the libc, the native triplet, no cross-compilation flags, and the weaker RISC-V memory model.
- The package name corrections of the active distro.

The summarizer prompt asks for a Markdown recipe with 6 H2 sections in this order: `Executive Summary`, `Prerequisites`, `Build Instructions`, `Architecture Notes`, `Verification`, and `Known Issues & Recommendations`.

## What does the analyst produce?

`analyst_node` makes one validated LLM call. It reads the evidence bundle from `collect_build_evidence()` and the scripted detection summary. It writes a `PackageAnalysis`:

| Field | Content |
|---|---|
| `purpose`, `language` | What the package is, and its main language |
| `build_system`, `build_system_confidence`, `build_system_reasoning` | The build system, with the file that proves it |
| `dependencies` | Up to 15 entries of a canonical name and the file evidence |
| `riscv_risks` | Up to 10 RISC-V risks that the evidence shows |
| `build_strategy` | 2 to 3 sentences on how to build |
| `expected_artifacts` | Up to 10 binary or library names |
| `needs_custom_plan` | True when a standard recipe for the build system will fail |
| `complexity` | 1 to 10 |
| `llm_grounded` | True for an LLM result, False for the fallback |

Later nodes use the analysis:

- `heuristic_plan_node` reads `needs_custom_plan`, the build system and the dependencies.
- The scout and fixer prompts include a compact text form of the analysis.
- `verify_node` uses `expected_artifacts`.
- The optimizer agent prompts use `purpose`.

With `--optimize` and a verified recipe cache entry, `cached_recipe_node` writes the analysis instead of the analyst, with `llm_grounded=False`.

The analyst replaced an earlier LLM planner. `task_plan` is now a fixed record from `create_default_plan()`, with no LLM call.

## What evidence does the fixer get?

`fixer_node` gives the model this evidence:

- The failed command and the first 3000 characters of the error.
- Source excerpts around the `file:line` references in the error, for up to 3 files, from `error_context_excerpts()`.
- The package analysis.
- The last 5 fix attempts, with the instruction not to repeat them.
- The first 500 characters of the repository tree, and up to 5 `high` or `critical` architecture findings.
- The build system and the completed phases.
- The platform banner, the static knowledge and up to 2 few-shot examples.

The fixer can ask for one bounded investigation round. In the first round, the model can return `{"investigate": {"commands": [...]}}` instead of a fix. Atesor then runs the commands with these limits:

- At most 4 commands.
- Each command is a single command. Its first word must be one of `cat`, `head`, `tail`, `ls`, `find`, `grep`, `egrep`, `file`, `stat`, `wc`, `pkg-config`, `readelf`, `nm`, `ldd`, `go` or `which`.
- No `<` or `>` redirection.
- Atesor keeps the first 1500 characters of each output.

Atesor puts the outputs into the prompt and asks again. In the second round the model must return a fix.

Atesor applies the actions of the recommended strategy. A `create_file` action writes through a sandbox command that resolves every symbolic link first and refuses a target outside the repository. A `patch` action must also stay in the repository. A `command` action must pass `validate_fix_command()` again. Atesor records the fix as a `FixAttempt`. The builder marks it as a success after the next successful build.

## How does few-shot memory work?

A few-shot example is a short record of an earlier, verified solution that Atesor puts into a prompt. `src/memory.py` keeps one JSON file per agent in the `examples` folder of the data directory:

- `scout_examples.json`: build plans. The scout prompt uses them.
- `fixer_examples.json`: error patterns and fixes. The fixer prompt uses them.
- `builder_examples.json`: build phases. Atesor saves them, but no prompt uses them.

`supervisor_examples.json` is a legacy file that no code reads. On the first run, Atesor copies the bundled example files into the writable data directory.

**Sandbox scope.** Each example has a `sandbox` key, for example `alpine-riscv64` or `debian-riscv64`. Retrieval removes examples from another sandbox before it scores. An example with no `sandbox` key counts as `alpine-riscv64`. If no example matches the active sandbox, the prompt gets no examples.

**Ranking.** `_calculate_relevance()` adds these weights and caps the score at 1.0:

| Signal | Weight |
|---|---|
| Same build system | +0.5 |
| The fixer `error_pattern` regex matches the error | +0.4 |
| Each example tag found in the error | +0.15 |
| Same `has_main` | +0.1 |
| Same `module_dir` | +0.15 |
| Both have a `module_dir`, but they differ | +0.05 |
| CGO context and a `cgo` tag | +0.2 |
| Same sandbox | +0.25 |
| Different sandbox | -0.35 |

Only examples with a positive score appear. The scout and fixer prompts get at most 2 examples and 2000 characters.

**Learning.** An unverified port saves no examples. After a verified port, `finish_node` saves these examples:

- A scout example with the build plan.
- A fixer example for each successful fix, with the escaped first 80 characters of its error as the `error_pattern`.
- A builder example with the phases.

**Cap and deduplication.** A new example is a duplicate when it has the same sandbox and the same repository and build system. A fixer example with the same `error_pattern` and build system is also a duplicate. So is a scout or builder example with the same commands. Each file keeps at most 100 examples. When a file has more, Atesor keeps the manual examples and removes the oldest auto-learned examples first. Learned examples get IDs such as `scout-auto-001`. Writes use a file lock and an atomic file replace.

See [Few-shot examples](/atesor/docs/contributing/few-shot-examples/) to add examples by hand.

## What does the LLM audit log record?

`src/llm_logger.py` writes every LLM call to a log file in the logs directory. `main.py` switches the file to `agent-call_<repo>.log` for each repository, so parallel batch runs do not mix their logs.

Each entry has these fields:

- A call ID and a timestamp.
- The agent role and the model. The optimizer agent logs its calls under the role label `optimizer`.
- The cost in USD, with 6 decimals, and the input and output token counts.
- Metadata as JSON, for example the repository, the attempt number and the pool index. An optimizer call also has a `phase`, for example `optimize-harness-c` or `optimize-workload-program`.
- The prompt and the response, each limited to 10000 characters, with a note on the dropped length.

A validated call logs every attempt that returns a response, also when the response fails validation. The entry shows the full message thread, with the critique messages. The logger is a thread-safe singleton. It also keeps the last 1000 call records in memory. See [Output files](/atesor/docs/reference/output-files/).
