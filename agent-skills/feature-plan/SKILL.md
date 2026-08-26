---
name: feature-plan
description: Produce an implementation-ready feature plan grounded in the current repository, ticket, architecture, conventions, and nearby code. Use when the user asks to plan a feature or technical change; do not implement unless implementation is also explicitly requested.
metadata:
  category: feature-planning
  scope: global
  resolution: fallback
---

# Feature Plan

Turn a feature request into a concrete plan that another engineer or agent can implement without rediscovering the design.

## Category resolution

This is the global fallback for the `feature-planning` category. Before applying it, search the active repository's skill directories (`.agents/skills`, `.github/skills`, `.claude/skills`, `.cursor/skills`, `.codex/skills`, `.gemini/skills`, and `.opencode/skills`) for a `SKILL.md` whose metadata has `category: feature-planning` and `scope: project`. If exactly one applies, read it first: `resolution: replace` means follow the project skill instead of the remainder of this skill; `resolution: extend` means apply this baseline followed by the project skill. If equally applicable project skills conflict, ask the user which one governs. If none exists, continue with this global skill.

## Discovery

1. Read the repository's agent instructions, architecture documents, conventions, and contribution workflow.
2. Read the supplied ticket, designs, requirements, and relevant parent or sibling work when accessible.
3. Inspect the affected code and the nearest existing implementation with similar behavior.
4. Identify boundaries, public interfaces, data ownership, dependencies, generated artifacts, configuration, and deployment implications.
5. Determine the repository's actual validation commands from scripts, manifests, and CI configuration.

Do not assume a framework, layer model, issue tracker, branching strategy, or test runner. Repository-specific instructions take precedence over shared guidance.

## Planning decisions

- State the goal, in-scope behavior, non-goals, and important assumptions.
- Map the change across the repository's existing layers and modules. Do not invent parallel architecture when an established path exists.
- Prefer extending an appropriate existing abstraction over creating a second one, while avoiding forced reuse across unrelated domains.
- Name concrete files and symbols when the repository provides enough evidence.
- Identify migrations, compatibility concerns, generated-code steps, configuration changes, and rollout or rollback needs.
- Specify tests as observable behaviors, boundary cases, failures, and state transitions—not as a coverage target.
- Ask only about decisions that materially change the implementation. Group questions into one focused round when possible.

## Plan audit

Before delivery, check the draft against any available code-conventions and architecture guidance. Correct layering skips, misplaced ownership, duplicated concepts, missing validation, and unsupported assumptions.

Use [references/plan-template.md](references/plan-template.md) for the deliverable. Omit sections that genuinely do not apply rather than filling them with boilerplate.

Planning alone is read-only. Do not edit the repository until the user also asks for implementation.
