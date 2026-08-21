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

## Hardware Profiling & Setup (Mac)

Before running the workflow on a new laptop, run the benchmark and configuration profiler:

```bash
# Detect hardware and view recommended Gemma model and flags
./scripts/benchmark-and-configure.sh --dry-run

# Automatically apply optimal settings to .env
./scripts/benchmark-and-configure.sh --apply

# Optionally download missing recommended model
./scripts/download-model.sh <model-key>
```

### Supported Hardware Tiers
- **Entry (≤8GB Unified RAM)**: Gemma 2B / 4B Q4_K_M (16K context, 4 threads)
- **Mid-Range (16GB–24GB Unified RAM)**: Gemma 4 12B Q4_0 / 9B Q4_K_M (32K context)
- **High Performance (32GB–48GB Unified RAM)**: Gemma 4 12B Q4_0 (64K context, 8 Performance cores)
- **Workstation (≥64GB Unified RAM)**: Gemma 27B Q8_0 (64K–128K context)

## Registered Frontends
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

