# Agent Instructions: Multi-Tier Workflow

## Delegation Policy

1. **Frontier Operations**: Handle all reasoning, architecture, planning, and code changes directly by default.
2. **Explicit Delegation Only**: When explicitly instructed by the user or triggered by an orchestration command (`/offload`, `/local-implement`):
   - Verify `llama-server` is up (`scripts/ensure-llama-server.sh` or `http://127.0.0.1:8090/health`).
   - Delegate implementation to the `implement_with_local_model` MCP tool by passing the interface specification.
   - Write the returned code to disk and verify functionality.

