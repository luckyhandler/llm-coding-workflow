# Two-Model Coding Workflow — Summary

## Overview

Vendor-neutral setup that saves a frontier agent's tokens: Claude Code or Codex plans and reviews, and a local coding agent (OpenCode driving Qwen3.8-27B on llama.cpp) does the implementation inside the repository. Both CLIs use it through one MCP server.

## Architecture

```
┌─────────────────┐  delegate_task   ┌──────────────────────┐   runs    ┌──────────────────────┐
│  Claude Code    │─────────────────▶│  local-gemma-mcp     │──────────▶│  OpenCode agent      │
│  / Codex CLI    │◀─────────────────│  (MCP server)        │           │  LSP · grep · edit · │
│  plan + review  │  ~300-token      │  snapshot, check,    │           │  bash (in the repo)  │
└─────────────────┘  summary         │  summary             │           └──────────┬───────────┘
                                     └──────────┬───────────┘                      │
                                                │ auto-starts                      │ OpenAI-compatible
                                                ▼                                  ▼
                                     ┌─────────────────────────────────────────────────────────┐
                                     │  llama-server + Metal: Qwen3.8-27B UD-Q6_K_XL,          │
                                     │  ngram-mod + MTP speculative decoding, 128K context     │
                                     └─────────────────────────────────────────────────────────┘
```

## Components

| Piece | What | Where |
|---|---|---|
| **llama.cpp** | Inference engine with Metal GPU offload | `brew install llama.cpp`; flags in `scripts/ensure-llama-server.sh` |
| **Qwen3.8-27B GGUF** | Local model (25 GB, embedded MTP head) | `models/Qwen3.8-27B-UD-Q6_K_XL.gguf` (`scripts/download-model.sh qwen3.8-27b-q6_k_xl`) |
| **OpenCode** | Agent harness for the local model | `brew install opencode`; isolated config in `agent-worker/opencode.json` |
| **local-gemma-mcp** | MCP server: `delegate_task`, `implement_with_local_model`, `local_model_status` | `mcp-server/`; Claude Code `~/.claude.json`, Codex `~/.codex/config.toml` |

## How it works

1. **Planning (Claude/Codex):** decide the approach with as little reading as possible and split the work into units a command can verify.
2. **Delegation:** call `delegate_task` with a short brief, the repository root (`cwd`), and a `check` command.
3. **Local agent:** the MCP server snapshots git state (`git stash create`, working tree untouched), then runs OpenCode in the repository. The agent navigates with LSP (workspace symbols, find references, go to definition) and grep, edits files, and iterates on the check. A time budget, OpenCode's step limit, and loop detection stop runaway sessions; history-changing git commands are denied.
4. **Summary:** the server runs the check again and returns the outcome, check result, changed files with line counts, the agent's notes, an undo command, and a `session_id` for follow-ups — typically about 300 tokens.
5. **Review:** the primary agent spot-checks `git diff` where the risk warrants it, follows up in the same agent session if needed, and runs the broader checks.

## Key design decisions

1. **Return summaries, not code.** Returning code costs the caller the code as input and again as output when writing it; the agent writes files itself.
2. **Reuse an agent harness.** OpenCode supplies file tools, edit application, LSP integration, and command execution; the MCP server only orchestrates, verifies, and summarizes.
3. **Thinking off by default.** Iterating on a failing check is usually cheaper than long reasoning; `thinking: true` is available for tricky units.
4. **Single model, one slot.** Delegations run one at a time against one llama-server slot; prompt caching keeps multi-step agent runs fast.
