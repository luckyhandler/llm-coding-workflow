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

## How It Works

1. **Standard Turns**: Agents handle design, discussions, reasoning, and normal code changes in context.
2. **Explicit Offload (`/offload <task>`)**:
   - Agent creates architecture & module specification (signatures/interfaces only).
   - Agent MUST invoke `implement_with_local_model` via the `local-gemma` MCP server (strictly prohibited from generating code bodies in response or via subagents).
   - Local Gemma 4 synthesizes the implementation.
   - Agent receives output, writes files to disk, and critiques/tests.

