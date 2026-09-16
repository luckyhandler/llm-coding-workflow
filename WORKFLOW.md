# Multi-Tier LLM Coding Workflow Guide

## Architecture

```
Claude Code / Opus / Codex / Hermes
  → planning
  → architecture
  → review / critique
        ↓  (explicit /offload command → delegate_task)
Local coding agent — OpenCode + Qwen3.8-27B on llama.cpp (via local-gemma MCP)
  → navigates with LSP / grep, edits, runs the check
  → returns a short summary (not code) to save the primary agent's tokens
```

## Machine Onboarding

To configure this environment on any Mac:
1. Run `./scripts/benchmark-and-configure.sh --apply` to profile hardware (RAM, P-cores, GPU) and write tuned settings to `.env`.
2. If the recommended model is missing, run `./scripts/download-model.sh <key>` or pass `--download` to the configurator.
3. The MCP server and `scripts/ensure-llama-server.sh` will automatically load your machine-specific profile.

## How It Works

1. **Standard Turns**: Agents handle design, discussions, reasoning, and normal code changes in context.
2. **Explicit Offload (`/offload <task>`)**:
   - Agent ensures local `llama-server` is active (`scripts/ensure-llama-server.sh` or `http://127.0.0.1:8090/health`).
   - Agent plans with minimal reading and splits the work into units that one command can verify.
   - Agent MUST invoke `delegate_task` via the `local-gemma` MCP server with a brief, `cwd`, and `check` (strictly prohibited from generating code bodies itself or via subagents).
   - The local agent works in the repository (LSP/grep navigation, edits, runs the check) and returns outcome, check result, changed files, notes, an undo command, and a `session_id`.
   - Agent reviews proportionally to risk (`git diff -- <file>` spot checks), sends follow-ups with the `session_id`, and runs the broader checks.



