# Multi-Model Coding Workflow Guide

## Architecture

```
Claude Code / Opus
  → planning
  → architecture
  → review / critique
        ↓
Hermes orchestrator / MCP
        ↓
Local coding agent — OpenCode + Qwen3.8-27B on llama.cpp (via local-gemma MCP `delegate_task`)
```

## Protocol

1. **Default Behavior**: Operate normally as an expert coding assistant for conversation, reasoning, code editing, and reviews.
2. **Explicit Offloading (`/offload` or `/local-implement`)**:
   - Follow the `local-model-implementation` skill: plan with minimal reading, then call the `delegate_task` MCP tool with a short brief, `cwd` = repository root, and a `check` command.
   - The local agent edits the repository itself; review its summary and spot-check `git diff` proportionally to risk.
   - Follow up with the returned `session_id`, then run the broader checks.


