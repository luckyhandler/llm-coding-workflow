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
Local llama.cpp / Gemma 4 (via local-gemma MCP)
```

## Protocol

1. **Default Behavior**: Operate normally as an expert coding assistant for conversation, reasoning, code editing, and reviews.
2. **Explicit Offloading**:
   - Only call the `implement_with_local_model` MCP tool when explicitly triggered via slash commands (such as `/offload` or `/local-implement`) or when the user explicitly requests offloading to the local model.
   - Do NOT implicitly delegate tasks without user intent.
