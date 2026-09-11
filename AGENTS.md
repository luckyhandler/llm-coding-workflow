# Agent Instructions: Multi-Tier Workflow

## Shared Skills

Portable agent skills live under `agent-skills/`. Keep their core instructions agent-neutral: do not depend on client-specific tool names, invocation syntax, or configuration paths. Repository-specific rules belong in the target repository's `AGENTS.md` and canonical documentation.

Every canonical skill must use a category from `agent-skills/categories.txt` with `metadata.scope: global` and `metadata.resolution: fallback`. Project-local skills use the same category with `scope: project` and either `resolution: replace` or `resolution: extend`.

Validate skill changes with `scripts/validate-agent-skills.sh`. Test installation changes with `scripts/install-agent-skills.sh --dry-run --home <temporary-directory>` before installing into a real home directory.

## Delegation Policy

1. **Frontier Operations**: Handle all reasoning, architecture, planning, and code changes directly by default.
2. **Explicit Delegation Only**: When explicitly instructed by the user or triggered by an orchestration command (`/offload`, `/local-implement`):
   - Follow the `local-model-implementation` skill: plan with minimal reading, then call the `delegate_task` MCP tool with a brief, `cwd` = repository root, and a `check` command. The local agent edits the repository itself and returns a short summary.
   - Review the summary and spot-check `git diff` proportionally to risk; follow up with the returned `session_id`.
   - Run the broader checks and verify functionality before reporting.
