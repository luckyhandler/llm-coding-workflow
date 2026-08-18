# local-gemma-mcp

MCP server that exposes a local Gemma 4 12B model (via llama.cpp) as an
`implement_with_local_model` tool. Works with any MCP-compatible client —
Claude Code, Codex CLI, etc. — without locking you into one vendor.

## Tools

- **implement_with_local_model** — send an implementation task/prompt to the
  local model. Auto-starts `llama-server` if it isn't already running.
- **local_model_status** — check if the llama-server is up.

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
claude mcp add -s user local-gemma -- node /Users/ninohandler/Development/llm-coding-workflow/mcp-server/server.js
```

## Register with Codex CLI

```bash
codex mcp add local-gemma -- node /Users/ninohandler/Development/llm-coding-workflow/mcp-server/server.js
```


## Usage

From either CLI, once registered:

> "Use the local-gemma tool to implement this function: ..."

The calling agent (Claude/Codex) is expected to do the planning; this tool is
purely for offloading mechanical implementation work to the free local model.

## Config (env vars)

| Var | Default | Purpose |
|---|---|---|
| `LOCAL_GEMMA_MODEL_PATH` | `../models/gemma-4-12b-it-qat-q4_0.gguf` | Path to GGUF model |
| `LOCAL_GEMMA_HOST` | `127.0.0.1` | llama-server bind host |
| `LOCAL_GEMMA_PORT` | `8090` | llama-server port |
| `LOCAL_GEMMA_GPU_LAYERS` | `99` | Metal GPU layers to offload |
| `LOCAL_GEMMA_CTX_SIZE` | `8192` | Context window |
| `LOCAL_GEMMA_THREADS` | `8` | CPU threads |

## Notes

- Gemma 4 (this quant) is a **thinking model** — it reasons internally before
  producing final output. Default `max_tokens` is 6000 to give it room for
  both. If a response gets truncated (`finish_reason: length`), ask for a
  smaller piece of work or pass a higher `max_tokens`.
- The MCP server auto-starts `llama-server` on first tool call and leaves it
  running for subsequent calls — no need to manage the process manually.
