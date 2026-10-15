---
title: Configure the LLM provider
description: Select Gemini, OpenAI, OpenRouter or Anthropic for Atesor, set the API key, put the .env file in the right folder, and see the model of each agent.
sidebar:
  order: 3
---

Eclipse Atesor™ uses one LLM provider for a run. You select the provider with `LLM_PROVIDER` and give its API key in the environment or in a `.env` file. This page lists the providers, tells where the `.env` file goes, and shows the model of each agent role.

## Which providers can I use?

| `LLM_PROVIDER` | Key variable | Models |
|---|---|---|
| `gemini` (default) | `GOOGLE_API_KEY` | `gemini-flash-lite-latest` for every role |
| `openai` | `OPENAI_API_KEY` | `gpt-4o` and `gpt-4o-mini` |
| `openrouter` | `OPENROUTER_API_KEY` | Free models (ids that end in `:free`), with a fallback chain |
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-haiku-5-5` and `claude-sonnet-5-5` |

:::note
The Anthropic provider is in the `main` branch from 2026-10-15. The v0.2.0 `.deb` package (2026-10-01) does not include it. To use it, run Atesor from a source checkout until the next release.
:::

The Anthropic provider needs the `langchain-anthropic` package. `pip install -r requirements.txt` installs it. If the package is not installed, the key check stops the port with `ERROR: langchain-anthropic is not installed (pip install -r requirements.txt)`.

## How do I select the provider?

Set the provider and its key, in your `.env` file or in the environment:

```bash
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=<your key>
```

Atesor applies these rules:

- If `LLM_PROVIDER` is not set, Atesor uses `gemini`.
- Atesor changes the value to lower case before it uses it.
- An unknown value stops the port with `ERROR: Unknown provider: <value>`.
- A key that is not set, or that has the placeholder value `your_key_here`, stops the port with `ERROR: <KEY_NAME> not found in environment`.

Atesor checks the key only before a port. `--setup-only`, `--probe` and a recipe cache hit do not need a key. After a good check, Atesor prints the provider and the models of the supervisor (S), planner (P) and builder (B) roles.

## Where does the .env file go?

| Install | Put the file here |
|---|---|
| Source checkout | `.env` in the root of the checkout |
| `.deb` package | `~/.config/atesor-ai/.env` |

For a source checkout, make the file from the template in the checkout root:

```bash
cp .env-example .env
```

For the `.deb` package, copy the template that the package installs:

```bash
mkdir -p ~/.config/atesor-ai
cp /opt/atesor-ai/app/.env-example ~/.config/atesor-ai/.env
```

Then open the file and set `LLM_PROVIDER` and the key. The template lists the provider keys and the main optional settings. [Environment variables](/atesor/docs/reference/environment-variables/) lists every variable.

You can also export the variables in your shell:

```bash
export LLM_PROVIDER=gemini
export GOOGLE_API_KEY=<your key>
```

### In which order does Atesor read the files?

A variable that is already in the environment wins over every file. Between the files, the first file that sets a variable wins. Atesor reads them in this order:

1. A `.env` file in the folder of `main.py`, or in a parent folder of it.
2. `$ATESOR_HOME/.env`, when `ATESOR_HOME` is set.
3. `~/.config/atesor-ai/.env`, or `$XDG_CONFIG_HOME/atesor-ai/.env` when `XDG_CONFIG_HOME` is set.
4. `~/.local/share/atesor-ai/.env`, or `$XDG_DATA_HOME/atesor-ai/.env` when `XDG_DATA_HOME` is set.

:::caution
With the `.deb` package, a `.env` file in your current folder has no effect. `main.py` calls `load_dotenv()` without a path, so python-dotenv searches from the folder of `main.py` (`/opt/atesor-ai/app`) and its parents. It does not search the current folder. Use `~/.config/atesor-ai/.env`, or export the variables.
:::

## Which model does each agent use?

The model table is `MODEL_CONFIG` in `src/models.py`.

| Role | `gemini` | `openai` | `openrouter` | `anthropic` |
|---|---|---|---|---|
| supervisor | `gemini-flash-lite-latest` | `gpt-4o-mini` | `qwen/qwen3-coder:free` | `claude-haiku-5-5` |
| planner | `gemini-flash-lite-latest` | `gpt-4o` | `openai/gpt-oss-120b:free` | `claude-haiku-5-5` |
| scout | `gemini-flash-lite-latest` | `gpt-4o` | `qwen/qwen3-coder:free` | `claude-haiku-5-5` |
| builder | `gemini-flash-lite-latest` | `gpt-4o-mini` | `qwen/qwen3-coder:free` | `claude-sonnet-5-5` |
| fixer | `gemini-flash-lite-latest` | `gpt-4o` | `openai/gpt-oss-120b:free` | `claude-sonnet-5-5` |
| summarizer | `gemini-flash-lite-latest` | `gpt-4o-mini` | `meta-llama/llama-3.3-70b-instruct:free` | `claude-haiku-5-5` |

The `gemini`, `openai` and `openrouter` entries set a temperature. It is 0.0 for the supervisor and the builder, 0.1 for the planner, the scout and the summarizer, and 0.2 for the fixer.

The two Anthropic models do not accept a temperature, so Atesor sends none. In its place, each `anthropic` entry sets an `effort` value for the adaptive thinking of the model. The value is `low` for the supervisor and the summarizer, and `medium` for the other roles.

These roles make the LLM calls:

- The analyst uses the `planner` entry.
- The scout uses the `scout` entry.
- The fixer uses the `fixer` entry.
- The summarizer writes the recipe, and the artifact curator ranks the build outputs. Both use the `summarizer` entry.
- In performance mode, the optimizer agent uses the `builder` entry to write a harness, and the `planner` entry to propose a program run. If no model of that role answers in time, Atesor asks the models of the other role one time.

The supervisor routes by rules, so its entry makes no calls. The `builder` entry makes calls only in performance mode.

## How do I change a model?

1. Use a source checkout. The `.deb` package keeps its install tree identical to the package contents.
2. Edit the `model` value of the role in `MODEL_CONFIG` in `src/models.py`.
3. If the new model is a paid model, add its price to `MODEL_PRICES_PER_MTOK` in the same file.

Without a price entry, Atesor prices a paid model at $3.00 for each million input tokens and $12.00 for each million output tokens. This rate counts toward the cost cap of $1.00 for each port. See [Cost control](/atesor/docs/guides/cost-control/).

## How does the OpenRouter fallback chain work?

OpenRouter is the only provider with fallback models. Gemini, OpenAI and Anthropic use the primary model only.

- **The chain.** `OPENROUTER_FALLBACK_MODELS` sets the chain as a comma-separated list of model ids. Atesor always adds `openrouter/free`, the OpenRouter router for free models, at the end. Without the variable, the chain is `qwen/qwen3-coder:free`, `openai/gpt-oss-120b:free`, `openai/gpt-oss-20b:free`, `meta-llama/llama-3.3-70b-instruct:free`, `qwen/qwen3-next-80b-a3b-instruct:free` and `nvidia/nemotron-3-super-120b-a12b:free`.
- **Server-side fallback.** Each request names three models for OpenRouter to try: the first two models of the chain that are not the primary model, and `openrouter/free`. OpenRouter refuses a request with more than three.
- **Client-side rotation.** When a call fails with a provider error, Atesor tries the next model of the chain. For a short `Retry-After` of 65 seconds or less, it waits one time for each model before it rotates.
- **Daily cap.** When the account reaches the OpenRouter daily cap for free models, Atesor stops the rotation and uses its deterministic fallback.

The default chain does not contain `openrouter/auto`, because that router selects paid models only.

## Which other LLM settings exist?

| Variable | Default | Effect |
|---|---|---|
| `ATESOR_MAX_OUTPUT_TOKENS` | `8192` | The output token limit of each LLM request |
| `ATESOR_LLM_TIMEOUT` | `120` | The request timeout in seconds. Atesor also stops a call after this value plus 15 seconds (60 seconds for the artifact curator, 240 seconds for a harness of the optimizer agent). |
| `OPENROUTER_FALLBACK_MODELS` | The default chain | The OpenRouter fallback chain |

[Environment variables](/atesor/docs/reference/environment-variables/) lists every variable.

## Next step

[Port your first package](/atesor/docs/getting-started/first-port/).
