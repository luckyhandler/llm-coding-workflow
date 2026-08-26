# Agent-Neutral Coding Workflow

A shared toolkit for consistent engineering workflows across Agent Skills-compatible clients. It includes portable skills for commits, feature planning, QA, conventions, architecture review, and explicit implementation offload to a local Gemma model.

## Shared agent skills

Canonical skills live in `agent-skills/`:

- `commit` — inspect, validate, stage, and create focused commits without pushing.
- `feature-plan` — produce repository-grounded implementation plans without coding.
- `qa-check` — discover and run the current repository's actual quality gates.
- `code-conventions` — shared engineering baseline, subordinate to repository rules.
- `architecture-review` — architecture-focused review against local decisions.
- `local-model-implementation` — explicitly offload an already-planned implementation to local Gemma.

The skills use the portable `SKILL.md` format and contain no dependency on a particular frontier agent. Repository-specific architecture, commands, scopes, and exceptions remain in each repository's `AGENTS.md` and linked documentation.

### Skill categories and project fallback

Every canonical skill declares three portable metadata values:

```yaml
metadata:
  category: quality-assurance
  scope: global
  resolution: fallback
```

Allowed categories are defined by `agent-skills/categories.txt`. They form stable resolution slots:

| Category | Global fallback |
|---|---|
| `architecture` | `architecture-review` |
| `code-conventions` | `code-conventions` |
| `commit` | `commit` |
| `feature-planning` | `feature-plan` |
| `implementation` | `local-model-implementation` |
| `quality-assurance` | `qa-check` |

A project can override a category with any skill name by placing a tagged `SKILL.md` in one of its project skill directories, preferably `.agents/skills/<name>/SKILL.md`:

```yaml
---
name: pyt-qa-check
description: Run the Park Your Truck quality gates.
metadata:
  category: quality-assurance
  scope: project
  resolution: replace
---
```

Use `resolution: replace` when the project skill is complete, or `resolution: extend` when it adds project-specific requirements after the global baseline. The global skills actively search for these category tags, so fallback does not depend on an individual client's skill-name precedence. A project should define at most one applicable skill per category and scope; equally applicable conflicts require an explicit choice.

Install or refresh all skills through symlinks:

```bash
./scripts/install-agent-skills.sh
./scripts/validate-agent-skills.sh
```

Use `./scripts/install-agent-skills.sh --dry-run` to inspect the target locations first. The installer exposes the same canonical directories to the shared Agent Skills location and the supported client-specific locations; it refuses to replace an existing file, directory, or unrelated symlink.

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
- `implement_with_local_model`: Generates code locally on Gemma 4, emitting thinking/reasoning inside `<local_model_thinking>` tags (auto-boots `llama-server` on Apple Silicon Metal GPU).
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

## Registered frontends
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
