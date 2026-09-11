# local-gemma-mcp

MCP server that exposes a local llama.cpp model (Qwen3.8-27B, Gemma 4, or any
GGUF model configured in `../.env`) as an `implement_with_local_model` tool. Works with any MCP-compatible client —
Claude Code, Codex CLI, etc. — without locking you into one vendor.

## Tools

- **implement_with_local_model** — send an implementation task/prompt to the
  local model. Arguments:
  - `prompt` (required) — the spec and output contract.
  - `files` — paths of existing files to include verbatim as context (resolved against `cwd`).
  - `cwd` — repository root for relative `files` (defaults to the server's working directory).
  - `thinking` — enable the reasoning phase (default `false`); its output is returned inside
    `<local_model_thinking>` tags.
  - `reasoning_effort` — `low` / `medium` / `high` reasoning depth when thinking is on
    (models whose chat template supports it, e.g. Qwen3.8; default `medium`).
  - `system`, `max_tokens`, `temperature` — optional overrides. Sampling otherwise follows the
    model vendor's recommended preset for the selected thinking mode.

  The response ends with a stats line (tokens, prefill/decode speed, elapsed time).
  Auto-starts `llama-server` via `../scripts/ensure-llama-server.sh` if it isn't running; the server
  keeps running afterwards so the model stays warm (`pkill llama-server` to stop it).
- **local_model_status** — check if the llama-server is up and which model it serves.

## Setup

```bash
cd mcp-server
npm install
```

## Register with Hermes

Add to `~/.hermes/config.yaml`:
```yaml
mcp_servers:
  local-gemma:
    command: /opt/homebrew/bin/node
    args:
      - /Users/ninohandler/Development/llm-coding-workflow/mcp-server/server.js
    connect_timeout: 120.0
    enabled: true
```

## Register with Claude Code

```bash
claude mcp add-json -s user local-gemma '{"type":"stdio","command":"node","args":["/Users/ninohandler/Development/llm-coding-workflow/mcp-server/server.js"],"timeout":1800000}'
```

`timeout` is in milliseconds (values below 1000 are ignored).

## Register with Codex CLI

```bash
codex mcp add local-gemma -- node /Users/ninohandler/Development/llm-coding-workflow/mcp-server/server.js
```

Then add `tool_timeout_sec = 1800` under `[mcp_servers.local-gemma]` in `~/.codex/config.toml`
(Codex defaults to 60 seconds per tool call).


## Usage

From either CLI, once registered:

> "Use the local-gemma tool to implement this function: ..."

The calling agent (Claude/Codex) is expected to do the planning; this tool is
purely for offloading mechanical implementation work to the free local model.

## Config (env vars)

All variables are read from `../.env` (see `../.env.example`); the historical `LOCAL_GEMMA_` prefix applies to any model.

| Var | Default | Purpose |
|---|---|---|
| `LOCAL_GEMMA_MODEL_NAME` | model file name | Selects the sampling preset (`qwen*`, `gemma*`) |
| `LOCAL_GEMMA_MODEL_PATH` | `models/gemma-4-12b-it-qat-q4_0.gguf` | Path to GGUF model |
| `LOCAL_GEMMA_DRAFT_MODEL_PATH` | — | Draft model / MTP head for speculative decoding |
| `LOCAL_GEMMA_SPEC_TYPE` | — | llama-server `--spec-type` (e.g. `draft-mtp`, `ngram-mod`) |
| `LOCAL_GEMMA_HOST` / `LOCAL_GEMMA_PORT` | `127.0.0.1` / `8090` | llama-server address |
| `LOCAL_GEMMA_CTX_SIZE` | `65536` | Context window |
| `LOCAL_GEMMA_PARALLEL` | `1` | llama-server slots |
| `LOCAL_GEMMA_MAX_TOKENS` | `16384` | Default response budget (reasoning + output) |
| `LOCAL_GEMMA_THINKING` | `false` | Default for the `thinking` argument |
| `LOCAL_GEMMA_REASONING_EFFORT` | `medium` | Default for the `reasoning_effort` argument |
| `LOCAL_GEMMA_MAX_FILE_BYTES` | `262144` | Per-file limit for `files` |

## Notes

- Keep thinking off for spec-driven implementation: the calling agent already did the reasoning,
  and thinking typically multiplies generated tokens several times over. Turn it on for
  algorithmically tricky units.
- If a response gets truncated (`finish_reason: length`), ask for a smaller piece of work or pass
  a higher `max_tokens`.
