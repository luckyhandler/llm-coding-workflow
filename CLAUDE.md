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
2. **Explicit Offloading (`/offload` or `/local-implement`)**:
   - Verify `llama-server` is up (`scripts/ensure-llama-server.sh` or `http://127.0.0.1:8090/health`).
   - You MUST call the `implement_with_local_model` MCP tool.
   - Do NOT synthesize function/class implementation bodies directly in your response.
   - Pass the interface spec into `implement_with_local_model`, receive the generated code, write it to disk, and verify.


