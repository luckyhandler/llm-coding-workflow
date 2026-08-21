# Multi-Tier LLM Coding Workflow Guide

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

## Machine Onboarding

To configure this environment on any Mac:
1. Run `./scripts/benchmark-and-configure.sh --apply` to profile hardware (RAM, P-cores, GPU) and write tuned settings to `.env`.
2. If the recommended model is missing, run `./scripts/download-model.sh <key>` or pass `--download` to the configurator.
3. The MCP server and `scripts/ensure-llama-server.sh` will automatically load your machine-specific profile.

## How It Works

1. **Standard Turns**: Agents handle design, discussions, reasoning, and normal code changes in context.
2. **Explicit Offload (`/offload <task>`)**:
   - Agent ensures local `llama-server` is active (`scripts/ensure-llama-server.sh` or `http://127.0.0.1:8090/health`).
   - Agent creates architecture & module specification (signatures/interfaces only).
   - Agent MUST invoke `implement_with_local_model` via the `local-gemma` MCP server (strictly prohibited from generating code bodies in response or via subagents).
   - Local Gemma 4 synthesizes the implementation.
   - Agent receives output, writes files to disk, and critiques/tests.



