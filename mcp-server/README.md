# local-gemma-mcp

MCP server that offloads coding work to a local llama.cpp model (Qwen3.8-27B, Gemma 4, or any
GGUF model configured in `../.env`). Works with any MCP-compatible client — Claude Code, Codex CLI,
etc. — without locking you into one vendor.

The point is to save the calling agent's tokens: `delegate_task` runs a local coding agent inside
your repository and returns a few hundred tokens of summary instead of code.

## Tools

- **delegate_task** — run a local coding agent ([OpenCode](https://opencode.ai) driving the local
  llama-server) in a git repository. The agent navigates with LSP (go to definition, find
  references, symbols) and grep, reads and edits files, and runs the check command until it passes.
  Arguments:
  - `task` (required) — the brief: goal, constraints, starting points (files/symbols), done criteria.
  - `cwd` (required) — absolute path inside a git repository with at least one commit.
  - `check` — shell command that verifies the work; the agent iterates on it and the server runs it
    again afterwards.
  - `thinking` / `reasoning_effort` — enable the model's reasoning phase for each step (default off).
  - `max_minutes` — time budget (default `LOCAL_AGENT_MAX_MINUTES`, 30); partial results are reported.
  - `session_id` — continue a previous delegation's agent session for follow-up fixes.

  Returns the outcome, the check result, changed files with line counts (relative to a snapshot
  taken before the run), the agent's notes, an undo command, and the session id. The snapshot is a
  dangling commit from `git stash create`, so neither the working tree nor refs are touched. Full
  event logs are kept under `~/.local/state/local-gemma-agent/runs/`.

  Guardrails (see `../agent-worker/opencode.json`): git commands that change history or the working
  tree state (commit, push, reset, checkout, restore, stash, clean, …), `rm -rf`, `sudo`, web access
  and sub-agents are denied; the agent runs with an isolated OpenCode config, so your global MCP
  servers, plugins and cloud providers are not loaded. It can still run any other shell command in
  the repository — it is not a sandbox.
- **implement_with_local_model** — one-shot generation that returns code. The code lands in the
  caller's context and the caller still writes it to disk, so this does not save tokens; use it only
  when you need generated code back. Arguments: `prompt` (required), `files` + `cwd` (context files),
  `thinking`, `reasoning_effort`, `system`, `max_tokens`, `temperature`.
- **local_model_status** — check if the llama-server is up and which model it serves.

Both generating tools auto-start `llama-server` via `../scripts/ensure-llama-server.sh`; the server
keeps running afterwards so the model stays warm (`pkill llama-server` to stop it). Delegations run
one at a time.

## Setup

```bash
cd mcp-server
npm install
npm test
```

`delegate_task` needs the `opencode` CLI (`brew install opencode`). Language servers for the
languages in your repository are started by OpenCode (most are downloaded on first use; Dart,
Swift and Rust use the toolchain already on your `PATH`).

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
claude mcp add-json -s user local-gemma '{"type":"stdio","command":"node","args":["/Users/ninohandler/Development/llm-coding-workflow/mcp-server/server.js"],"timeout":3600000}'
```

`timeout` is in milliseconds (values below 1000 are ignored).

## Register with Codex CLI

```bash
codex mcp add local-gemma -- node /Users/ninohandler/Development/llm-coding-workflow/mcp-server/server.js
```

Then add `tool_timeout_sec = 3600` under `[mcp_servers.local-gemma]` in `~/.codex/config.toml`
(Codex defaults to 60 seconds per tool call).

## Usage

From either CLI, once registered, plan the change yourself and then:

> "Delegate this to the local agent: add a `--dry-run` flag to the export command in
> src/cli/export.ts, following how `--force` is handled; check with `npm test -- export`."

## Config (env vars)

All variables are read from `../.env` (see `../.env.example`); the historical `LOCAL_GEMMA_` prefix
applies to any model.

| Var | Default | Purpose |
|---|---|---|
| `LOCAL_GEMMA_MODEL_NAME` | model file name | Selects the sampling preset (`qwen*`, `gemma*`) |
| `LOCAL_GEMMA_MODEL_PATH` | `models/gemma-4-12b-it-qat-q4_0.gguf` | Path to GGUF model |
| `LOCAL_GEMMA_DRAFT_MODEL_PATH` | — | Draft model / MTP head for speculative decoding |
| `LOCAL_GEMMA_SPEC_TYPE` | — | llama-server `--spec-type` (e.g. `draft-mtp`, `ngram-mod`) |
| `LOCAL_GEMMA_HOST` / `LOCAL_GEMMA_PORT` | `127.0.0.1` / `8090` | llama-server address |
| `LOCAL_GEMMA_CTX_SIZE` | `65536` | Context window (also the agent's context limit) |
| `LOCAL_GEMMA_PARALLEL` | `1` | llama-server slots |
| `LOCAL_GEMMA_MAX_TOKENS` | `16384` | Default one-shot response budget (reasoning + output) |
| `LOCAL_GEMMA_THINKING` | `false` | Default for the `thinking` argument |
| `LOCAL_GEMMA_REASONING_EFFORT` | `medium` | Default for the `reasoning_effort` argument |
| `LOCAL_GEMMA_MAX_FILE_BYTES` | `262144` | Per-file limit for `files` |
| `LOCAL_AGENT_MAX_MINUTES` | `30` | Default `delegate_task` time budget |
| `LOCAL_AGENT_OPENCODE_BIN` | `opencode` | OpenCode binary |
| `LOCAL_AGENT_STATE_DIR` | `~/.local/state/local-gemma-agent` | Isolated OpenCode config/sessions and run logs |

## Notes

- Keep thinking off for spec-driven work: the calling agent already did the reasoning, and
  thinking multiplies generated tokens several times over. With `delegate_task` the agent can
  iterate on a failing check instead, which usually beats thinking harder up front. For genuinely
  hard algorithmic units thinking can succeed where iteration loops (measured: 34/34 tests after
  34 minutes, versus 27/34 at the step limit without thinking), so pair it with a larger `max_minutes`.
- Delegations take minutes, not seconds. Scope tasks so that `check` can verify them.
