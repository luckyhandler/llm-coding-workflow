# Agent Instructions: Multi-Tier Workflow

## Delegation Policy

1. **Frontier Operations**: Handle all reasoning, architecture, planning, and code changes directly by default.
2. **Explicit Delegation Only**: Only dispatch to the `local-gemma` MCP server (`implement_with_local_model`) when explicitly instructed by the user or triggered by an orchestration command (`/offload`, `/local-implement`).
