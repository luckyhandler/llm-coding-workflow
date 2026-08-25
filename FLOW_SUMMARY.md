# Two-Model Coding Workflow — Summary

## Overview

Vendor-neutral setup for coding with Claude first-class models for planning + local Gemma 4 for implementation. Works in both Claude Code and Codex CLI via a single MCP server.

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│  Claude Code    │────▶│  local-gemma-mcp     │────▶│  llama.cpp + Metal   │
│  / Codex CLI    │     │  (MCP server)        │     │  Gemma 4 12B QAT    │
│                 │     │                      │     │  (Q4_0, 6.5 GB)     │
└─────────────────┘     └──────────┬───────────┘     └──────────────────────┘
                                   │                            ▲
                                   │                            │
                                   └──── auto-starts on use ────┘
```

## Components

| Piece | What | How registered |
|---|---|---|
| **llama.cpp** | Inference engine w/ Metal GPU offload | `brew install llama.cpp` |
| **Gemma 4 12B QAT Q4_0 GGUF** | Local model (6.5 GB) | `models/gemma-4-12b-it-qat-q4_0.gguf` |
| **local-gemma-mcp** | Node.js MCP server wrapping llama.cpp | Claude Code: `~/.claude.json`; Codex: `~/.codex/config.toml` |
| **Claude Code** | First-class model for planning | `claude auth login` |
| **Codex CLI** | Alternative first-class agent | `codex` (already installed) |

## How it works

1. **Planning (Claude/Codex, your choice):** Drive interactively as usual. Use Claude Sonnet for architecture, plans, PR reviews.

2. **Implementation request:** When you want Gemma to implement something, ask either CLI:
   > "use local-gemma to implement X, output each file with `// FILE: path` headers"

3. **MCP server action:**
   - Checks if `llama-server` on `:8090` is alive (health check)
   - If not → auto-spawns `llama-server --n-gpu-layers 99` (Metal offload)
   - Sends prompt to Gemma 4 via OpenAI-compatible `/v1/chat/completions`
   - Returns raw code output back into the agent's context

4. **Local model behavior:** Gemma 4 is a **thinking model** — it reasons internally before emitting code. Default `max_tokens=6000` covers reasoning + implementation. Watch for truncation (`finish_reason: length`) on large tasks → raise the limit.

## Usage

```
# In Claude Code (interactive):
User: "Use local-gemma to write a Dart BLoC pattern for auth state"

# In Codex print mode:
codex exec "Use local-gemma to implement the auth BLoC we discussed" --sandbox workspace-write

# Standalone server (for direct API use):
llama-server -m models/gemma-4-12b-it-qat-q4_0.gguf --n-gpu-layers 99 --port 8080

# Direct llama-cli (for testing):
llama-cli -m models/gemma-4-12b-it-qat-q4_0.gguf -p "..."
```

## Key Design Decisions

1. **MCP server** (not script) — single integration point works with any MCP client (Claude Code, Codex, future agents). No vendor lock-in.

2. **Official Google model** — `gemma-4-12b-it-qat-q4_0-gguf` from `google/`, not community QAT. Verifiable trust chain.

3. **Auto-start pattern** — MCP server manages llama-server lifecycle. Agent calls never need to handle the process.

4. **Q4_0 quant** — right balance for 32 GB M1 Pro: ~6.5 GB model, runs at 20 t/s generation, full Metal offload (99 layers).

## Files

```
mcp-server/
  server.js        # MCP server (stdio transport)
  package.json     # @modelcontextprotocol/sdk dependency
  README.md        # Usage docs
models/
  gemma-4-12b-it-qat-q4_0.gguf   # gitignored
workflows/
  run-coding-session.sh   # standalone orchestrator (legacy)
  quick-run.sh            # quick 2-phase CLI script
```
