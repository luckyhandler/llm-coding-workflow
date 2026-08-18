# Multi-Tier LLM Coding Workflow

A local MCP-driven architecture where frontier agents (Claude Code, Claude Desktop, Hermes, Codex) handle planning and review, while offloading code implementation to a local Gemma 4 model via MCP only on explicit slash command.

## Architecture

```
Claude Code / Opus / Codex / Hermes
  → planning
  → architecture
  → review / critique
        ↓  (explicit /offload command)
Local llama.cpp / Gemma 4 (via local-gemma MCP)
  → implementation
  → code edits
```

## Setup & Integration

The `local-gemma` MCP server (`mcp-server/server.js`) exposes:
- `implement_with_local_model`: Generates code locally on Gemma 4 (auto-boots `llama-server` on Apple Silicon Metal GPU).
- `local_model_status`: Checks health of local server.

### Registered Frontends
- **Claude Code**: `~/.claude.json`
- **Claude Desktop**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Hermes**: `~/.hermes/config.yaml`
- **Codex CLI**: `~/.codex/config.toml`

## Usage

In your agent frontend (e.g. Claude Code):
- Work normally for standard conversation and coding.
- Trigger explicit local delegation with:
  ```text
  /offload <task description>
  ```
  or
  ```text
  /local-implement <task description>
  ```
