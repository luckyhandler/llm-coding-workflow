# Agent Instructions: Multi-Tier Workflow

## Shared Skills

Portable agent skills live under `agent-skills/`. Keep their core instructions agent-neutral: do not depend on client-specific tool names, invocation syntax, or configuration paths. Repository-specific rules belong in the target repository's `AGENTS.md` and canonical documentation.

Every canonical skill must use a category from `agent-skills/categories.txt` with `metadata.scope: global` and `metadata.resolution: fallback`. Project-local skills use the same category with `scope: project` and either `resolution: replace` or `resolution: extend`.

Validate skill changes with `scripts/validate-agent-skills.sh`. Test installation changes with `scripts/install-agent-skills.sh --dry-run --home <temporary-directory>` before installing into a real home directory.

## Local Runtime and Overnight Runs

The local worker model is served by llama.cpp (`LOCAL_BACKEND=llama`) or MLX
(`LOCAL_BACKEND=mlx`); both are OpenAI-compatible and the harness above them is
unchanged. Only one backend can be resident at a time on a 64GB machine. Decode
is memory-bandwidth bound, so the fastest configuration here is a sparse MoE
model with llama.cpp's `draft-mtp` speculative decoding.

- Benchmark any OpenAI-compatible server: `scripts/benchmark-local-models.sh --url <base-url>`.
- Compare worker models on real tasks: `node mcp-server/eval.js --base-url <base-url> --label <name>`. Test files are restored and the check re-run before a pass counts.
- Run a whole plan unattended: `node mcp-server/overnight.js <plan.md> --commit --max-hours N`. It verifies each task, retries failures with the check output fed back, resumes from a state file, and honours `protect:` globs so a passing check cannot come from weakened or fabricated tests.
- Validate harness changes with `cd mcp-server && npm test`.
- Runtime/model measurements and the reasons for the defaults are in `docs/local-inference.md`; read it before changing the model, quantization, or backend.

## Delegation Policy

1. **Frontier Operations**: Handle all reasoning, architecture, planning, and code changes directly by default.
2. **Explicit Delegation Only**: When explicitly instructed by the user or triggered by an orchestration command (`/offload`, `/local-implement`):
   - Follow the `local-model-implementation` skill: plan with minimal reading, then call the `delegate_task` MCP tool with a brief, `cwd` = repository root, and a `check` command. The local agent edits the repository itself and returns a short summary.
   - Review the summary and spot-check `git diff` proportionally to risk; follow up with the returned `session_id`.
   - Run the broader checks and verify functionality before reporting.
