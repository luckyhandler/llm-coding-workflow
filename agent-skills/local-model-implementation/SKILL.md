---
name: local-model-implementation
description: Delegate an already-planned coding task to the local-gemma agent (a local model working directly in the repository) to save the primary agent's tokens, while the primary agent keeps planning, review, and verification. Use only when the user explicitly requests local-gemma, a local model, offloading, /offload, /local-implement, or this skill; do not activate for ordinary coding work.
metadata:
  category: implementation
  scope: global
  resolution: fallback
  workflow: two-model-coding
  worker: local-gemma
---

# Local Model Implementation

This workflow requires an MCP server named `local-gemma` exposing `delegate_task` (and optionally `local_model_status`). It runs a local model (Qwen3.8-27B via llama.cpp) as a coding agent inside the repository. The goal is to save the primary agent's tokens: the local agent reads, edits, and tests; the primary agent receives only a short summary.

Keep architecture, planning, scope decisions, review, and user communication with the primary agent. Delegate well-scoped implementation work whose result a command can verify.

## Category resolution

This is the global fallback for the `implementation` category. Before applying it, search the active repository's skill directories (`.agents/skills`, `.github/skills`, `.claude/skills`, `.cursor/skills`, `.codex/skills`, `.gemini/skills`, and `.opencode/skills`) for a `SKILL.md` whose metadata has `category: implementation` and `scope: project`. If exactly one applies, read it first: `resolution: replace` means follow the project skill instead of the remainder of this skill; `resolution: extend` means apply this baseline followed by the project skill. If equally applicable project skills conflict, ask the user which one governs. If none exists, continue with this global skill.

## Delegation protocol

1. Confirm that the user explicitly requested local-model implementation. If not, continue normally without invoking this skill.
2. Plan the change, but spend as few tokens as possible doing it: read only what you need to decide the approach and to name good starting points. Do not pre-read files the local agent will read anyway, and do not write the code yourself.
3. Find the `local-gemma` MCP tools. Clients may expose them as `delegate_task`, a server-qualified name, or a sanitized `mcp__local_gemma__delegate_task` name. If the tool is unavailable, report the missing integration and stop rather than silently implementing with the primary model.
4. Split the work into units that one command can verify (a test file, a test filter, a build, a linter). Each delegation should be one coherent change.
5. Call `delegate_task` with:
   - `task`: a brief containing the goal and non-goals; starting points (files, symbols, similar existing code to follow); constraints (APIs, dependencies that may or may not be used, conventions); and what done means;
   - `cwd`: the absolute repository root;
   - `check`: the command that proves the unit works (write or name the test first when none exists);
   - `thinking: true` only for algorithmically tricky units — iterating on a failing check is usually the cheaper fix.
6. Read the summary. It reports the outcome, the check result, changed files with line counts, the agent's notes, an undo command, and a `session_id`.
7. Review proportionally to risk, not exhaustively:
   - check PASS and the changed files match the expected scope → spot-check with `git diff -- <file>` where correctness is subtle (security, concurrency, public APIs, migrations);
   - unexpected files, deletions, or large line counts → inspect those diffs before anything else;
   - check FAIL → decide from the failure output whether to follow up or abandon.
8. For fixes, call `delegate_task` again with the returned `session_id` and a focused correction (what is wrong and what must change). The agent keeps its context, so do not resend the whole brief.
9. Run the repository's broader checks (formatter, static analysis, full or affected test suites) once the delegated units pass.

Stop after three unsuccessful delegations on the same unit. Revert with the summary's undo command if the result is unusable, report the concrete blocker, and ask the user whether to revise the brief, raise the budget (`max_minutes`, `thinking`), or return the task to the primary agent.

`implement_with_local_model` (one-shot generation that returns code) does not save tokens, because the code lands in your context and you must still write it. Use it only when you need generated code back, not as the default offload path.

## Completion report

State what the local agent changed, what you verified and how, which checks passed, and any remaining limitations. Do not claim success based only on the agent's notes.
