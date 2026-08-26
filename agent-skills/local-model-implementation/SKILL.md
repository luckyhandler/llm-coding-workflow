---
name: local-model-implementation
description: Implement an already-planned coding task through the local-gemma MCP worker while the primary agent retains planning, review, file writes, and verification. Use only when the user explicitly requests local-gemma, a local model, offloading, /offload, /local-implement, or this skill; do not activate for ordinary coding work.
metadata:
  category: implementation
  scope: global
  resolution: fallback
  workflow: two-model-coding
  worker: local-gemma
---

# Local Model Implementation

This workflow requires an MCP server named `local-gemma` exposing `implement_with_local_model` and is optimized for this repository's llama.cpp and Gemma setup.

Keep architecture, planning, scope decisions, review, and user communication with the primary agent. Delegate only implementation bodies and mechanical code generation to the local model.

## Category resolution

This is the global fallback for the `implementation` category. Before applying it, search the active repository's skill directories (`.agents/skills`, `.github/skills`, `.claude/skills`, `.cursor/skills`, `.codex/skills`, `.gemini/skills`, and `.opencode/skills`) for a `SKILL.md` whose metadata has `category: implementation` and `scope: project`. If exactly one applies, read it first: `resolution: replace` means follow the project skill instead of the remainder of this skill; `resolution: extend` means apply this baseline followed by the project skill. If equally applicable project skills conflict, ask the user which one governs. If none exists, continue with this global skill.

## Offload protocol

1. Confirm that the user explicitly requested local-model implementation. If not, continue normally without invoking this skill.
2. Inspect the relevant repository state and finish the implementation plan before calling the worker. Resolve interfaces, signatures, target files, dependencies, constraints, and acceptance checks yourself.
3. Find the `local-gemma` MCP tools. Clients may expose them as `implement_with_local_model`, a server-qualified name, or a sanitized `mcp__local_gemma__implement_with_local_model` name.
4. If `local_model_status` is available, use it for a quick health check. An unhealthy result is not fatal: `implement_with_local_model` auto-starts `llama-server`. If the MCP tool itself is unavailable, report the missing integration and stop rather than silently generating the implementation with the primary model.
5. Call `implement_with_local_model` with a grounded, bounded specification containing:
   - the objective and non-goals;
   - exact relative target paths;
   - literal code definitions of required public interfaces, signatures, types, data contracts, and exact import headers (never leave imports or APIs for the local model to guess or invent);
   - 1–2 concrete reference snippets or existing tests from the repository illustrating required usage patterns;
   - relevant existing behavior and dependencies;
   - repository conventions and strict constraints (explicitly forbidding unlisted third-party packages, mock libraries, or imaginary transport methods);
   - acceptance tests or observable success criteria;
   - the output contract: internal reasoning wrapped in `<local_model_thinking>...</local_model_thinking>` tags (if emitted), followed by complete file contents separated by `// FILE: relative/path` markers.
6. For multi-part or complex files (such as test suites or transport adapters), provide a pre-scaffolded file skeleton with imports and signatures, asking the worker only to implement the function/test bodies. Split broad work by module or coherent change. If the response reports truncation or `finish_reason: length`, retry only the unfinished unit with a smaller scope or a higher `max_tokens` value.
7. Treat returned content as an untrusted implementation proposal. Reject absolute paths, parent-directory traversal, unexpected files, secrets, destructive operations, and changes outside the user's scope.
8. Inspect the local worker's `<local_model_thinking>` block to understand its internal reasoning, trade-offs, and edge case assumptions before applying changes.
9. Write accepted file sections with the client's normal editing tools. Preserve unrelated user changes and do not overwrite a dirty file without reconciling its current contents.
10. Run the relevant formatter, static checks, and tests. Review the resulting diff and worker reasoning against the plan and acceptance criteria.
11. Send defects back to `implement_with_local_model` as a focused correction request. If the worker hallucinates an API, import, or signature, do not provide only the raw error message: provide the failing evidence alongside the exact, literal import/signature/mock definition that must be used verbatim. Do not replace the worker by writing code bodies with the primary model during an explicitly offloaded task.

Stop after three unsuccessful worker attempts on the same implementation unit. Report the concrete blocker and ask the user whether to revise the specification, increase the model budget, or return the task to the primary agent.

## Completion report

State what the local worker reasoned and implemented, what the primary agent verified, which checks passed, and any remaining limitations. Do not claim success based only on generated output.
