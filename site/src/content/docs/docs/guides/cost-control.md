---
title: Cost control
description: The $1.00 per-package cost cap, how Atesor counts real tokens and cost, free-tier models, deterministic fallbacks, and where to see the cost of a run.
sidebar:
  order: 5
---

Eclipse Atesor™ counts the real tokens and the cost of every LLM call in a run. A run escalates when its cost passes $1.00. Many steps make no LLM call at all, and when the LLM fails, most steps fall back to rules.

## What is the cost cap?

The cap is $1.00 for each package run. It is the local variable `cost_limit = 1.0` in `should_escalate()` in `src/state.py`. No flag or environment variable changes it.

```python
# Hard per-package spend cap, in USD.
cost_limit = 1.0
if state.api_cost_usd > cost_limit:
    return True, f"API cost limit (${cost_limit}) exceeded"
```

- The supervisor checks the cap each time that it routes the run. When the total cost is above $1.00, it sends the run to escalation with the reason `API cost limit ($1.0) exceeded`. The run exits with code 1.
- The build-fix loop does not check the cap between its steps. Thus the total can pass $1.00 by the cost of the calls after the last check.
- A build with the status `SUCCESS` always goes to the finish step, also above the cap. Atesor does not discard a build that worked.
- The cap is for one run. In a batch, each package run has its own total.
- The cap does not stop [performance mode](/atesor/docs/guides/optimize/) (`--optimize`). Performance mode runs after the finish step, so the supervisor does not check the cap again. Its LLM calls still add to the run total.

`--max-attempts` (default 5) also limits the cost, because each fix attempt can call the LLM. See [Troubleshooting](/atesor/docs/guides/troubleshooting/) for all escalation rules.

## How does Atesor count tokens and cost?

After each LLM call, Atesor reads the token counts that the provider returns. It reads `usage_metadata` first, then the OpenAI-style `token_usage`. Then `cost_for_usage()` in `src/models.py` calculates the cost:

- A free-tier model costs $0. A model is free when its ID ends in `:free`, or when it is `openrouter/free`.
- A paid model costs its input tokens and output tokens at the prices in `MODEL_PRICES_PER_MTOK`.
- A paid model that is not in the table uses a high default price, $3.00 for each million input tokens and $12.00 for each million output tokens. Thus an unknown model reaches the cap early. It never counts as free.
- When the provider reports no token usage, the call counts as 0 tokens and $0.
- Every attempt that returns a response counts. This includes a response that Atesor rejects before it tries again.

`MODEL_PRICES_PER_MTOK`, in USD for each million tokens:

| Model | Input | Output |
|---|---|---|
| `gpt-4o` | 2.50 | 10.00 |
| `gpt-4o-mini` | 0.15 | 0.60 |
| `gemini-flash-lite-latest` | 0.10 | 0.40 |
| `gemini-flash-latest` | 0.30 | 2.50 |
| `claude-haiku-5-5` | 0.10 | 0.50 |
| `claude-sonnet-5-5` | 2.00 | 10.00 |

The table holds one base price for each model. Atesor does not apply a higher price for a long prompt.

Two other settings limit each call: `ATESOR_MAX_OUTPUT_TOKENS` (default 8192 output tokens) and `ATESOR_LLM_TIMEOUT` (default 120 seconds).

## Which models does each provider use?

`MODEL_CONFIG` in `src/models.py` gives one model to each agent role. When `LLM_PROVIDER` is not set, Atesor uses `gemini`.

| Role | `openrouter` | `gemini` | `openai` | `anthropic` |
|---|---|---|---|---|
| planner (the analyst) | `openai/gpt-oss-120b:free` | `gemini-flash-lite-latest` | `gpt-4o` | `claude-haiku-5-5` |
| scout | `qwen/qwen3-coder:free` | `gemini-flash-lite-latest` | `gpt-4o` | `claude-haiku-5-5` |
| fixer | `openai/gpt-oss-120b:free` | `gemini-flash-lite-latest` | `gpt-4o` | `claude-sonnet-5-5` |
| summarizer | `meta-llama/llama-3.3-70b-instruct:free` | `gemini-flash-lite-latest` | `gpt-4o-mini` | `claude-haiku-5-5` |
| supervisor | `qwen/qwen3-coder:free` | `gemini-flash-lite-latest` | `gpt-4o-mini` | `claude-haiku-5-5` |
| builder | `qwen/qwen3-coder:free` | `gemini-flash-lite-latest` | `gpt-4o-mini` | `claude-sonnet-5-5` |

- The supervisor makes no LLM call. Its entry exists only in the table.
- The builder makes an LLM call only in performance mode: its models write the harness of the optimizer agent. In performance mode, the planner models also select a program run.
- With `anthropic`, Atesor sends no temperature. It sends an `effort` level instead: `low` for the supervisor and the summarizer, and `medium` for the other roles.

With the `openrouter` provider, every default model is a free-tier model, so the run cost is $0. With the `anthropic` provider, every model is a paid model in `MODEL_PRICES_PER_MTOK`. If you add a paid model to `OPENROUTER_FALLBACK_MODELS`, Atesor counts its cost. See [Configure the LLM](/atesor/docs/getting-started/configure-llm/) to set the provider.

### What happens when a free model is not available?

- `OPENROUTER_FALLBACK_MODELS` is a comma-separated list of fallback model IDs. Without it, Atesor uses a built-in list of free models. Atesor always adds `openrouter/free`, the OpenRouter router that selects an available free model, as the last entry.
- Each OpenRouter request names the main model, two fallback models and `openrouter/free`. OpenRouter tries them in the same request.
- When a call still fails with a provider error, Atesor tries the next model in the list.
- When the provider sends a short `Retry-After` value (65 seconds or less), Atesor waits one time on the same model.
- When the provider returns HTTP 402 with the number of tokens that the account can pay for, Atesor lowers the output token limit and tries again.
- When OpenRouter reports that the account has no daily free-model requests left, Atesor stops the retries and uses the deterministic fallback of that step.

## What runs when the LLM is not available?

Many steps make no LLM call. The rest fall back to rules when all attempts fail:

| Step | LLM call | Fallback when the LLM fails |
|---|---|---|
| Recipe cache hit | None | Not needed. A cache hit needs no API key. |
| Clone and scripted analysis | None | Not needed. |
| Analyst | Yes | `_fallback_analysis()` makes the analysis from the scripted detection. When detection confidence is below 0.5, the plan goes to the LLM scout. |
| Heuristic plan | None | Not needed. It makes a default build plan for a known build system. |
| Scout | Yes | `create_fallback_build_plan()` makes a basic plan for the detected build system. The failure counts as an attempt. |
| Supervisor | None | Not needed. The routing uses rules. |
| Builder and its recovery steps | None | Not needed. For example, it installs a missing header package or runs a build again with one job. |
| Verification | None | Not needed. |
| Fixer | Yes | No fallback. The fixer records the failure as an attempt, and the run goes back to the supervisor. |
| Summarizer (the recipe) | Yes | A short recipe with the build steps and the verification verdict. |
| Artifact curator | Yes | Rule-based curation of the build outputs. |
| Cached recipe (`--optimize`) | None | Not needed. A verified cached recipe replaces the analyst and the scout. |
| Performance mode (`--optimize`) | Yes, for a program run or a harness | No fallback. Atesor tries the next workload source. The result of the port does not change. |

See [LLM layer](/atesor/docs/architecture/llm-layer/) for the prompts and the retry rules.

## How do I see the cost of a run?

- **The report.** The Metrics table of `<repo>_report_<time>.md` in the output directory has the rows `API Calls`, `LLM Tokens (in/out)` and `Cost (from token usage)`.
- **The state file.** `<repo>_state_<time>.json` has the fields `api_calls_made`, `api_tokens_in`, `api_tokens_out` and `api_cost_usd`.
- **The call log.** `logs/agent-call_<repo>.log` has one block for each LLM call, with the agent, the model, `COST: $...`, `TOKENS: in=... out=...`, the prompt and the response.
- **The agent log.** Each supervisor step writes `Supervisor summary: ...` with `cost=$...` to `logs/agent_<repo>.log`.
- **The escalation report.** An escalated run records its cost in the escalation report in the state file.

The artifact curator call appears in the call log, but Atesor does not add it to the run total. `batch_test.py` does not add up the cost of a batch. See [Output files](/atesor/docs/reference/output-files/) for the location of each file.
