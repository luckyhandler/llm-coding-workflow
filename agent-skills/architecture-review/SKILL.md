---
name: architecture-review
description: Review a proposed design, change set, module, or repository for architectural correctness, ownership, separation of concerns, dependency direction, modularity, and unnecessary complexity. Use for architecture reviews rather than ordinary code-style checks.
metadata:
  category: architecture
  scope: global
  resolution: fallback
---

# Architecture Review

Evaluate the design against the architecture the repository actually declares. Use general principles only where local decisions are absent.

## Category resolution

This is the global fallback for the `architecture` category. Before applying it, search the active repository's skill directories (`.agents/skills`, `.github/skills`, `.claude/skills`, `.cursor/skills`, `.codex/skills`, `.gemini/skills`, and `.opencode/skills`) for a `SKILL.md` whose metadata has `category: architecture` and `scope: project`. If exactly one applies, read it first: `resolution: replace` means follow the project skill instead of the remainder of this skill; `resolution: extend` means apply this baseline followed by the project skill. If equally applicable project skills conflict, ask the user which one governs. If none exists, continue with this global skill.

## Establish scope

1. Read repository and subtree agent instructions, architecture documents, and relevant decision records.
2. Identify the requested scope: proposal, changed files, module, service, or whole repository.
3. For change reviews, build a closed inventory of in-scope paths and examine relevant unchanged neighbors that establish boundaries or usage.
4. Exclude generated, vendored, build, cache, and explicitly archived areas unless the user includes them.

## Review axes

- **Ownership:** Each concept has a clear authoritative module and does not accumulate conflicting representations.
- **Separation of concerns:** Presentation, orchestration, domain policy, persistence, transport, and infrastructure responsibilities remain appropriately separated for the repository's chosen architecture.
- **Dependency direction:** High-level policy does not depend directly on replaceable implementation details; cross-module access uses intended public boundaries.
- **Modularity:** Public interfaces are purposeful, cycles are avoided, and changes do not require unrelated modules to know internal details.
- **Simplicity:** Abstractions earn their indirection. Avoid speculative frameworks, duplicated layers, and extension points without a demonstrated need.
- **Data and errors:** Mapping and validation occur at clear boundaries; failure semantics remain meaningful across layers.
- **Operations:** Configuration, migrations, observability, compatibility, rollout, and recovery concerns are owned where relevant.

Do not label a documented architectural choice as a defect merely because another pattern is also reasonable.

## Findings

Lead with actionable findings ordered by impact. For each finding include:

- severity;
- precise path and line or design section;
- the violated local decision or architectural risk;
- the smallest viable correction;
- a validation or migration note when relevant.

Then provide assumptions or open questions, followed by a brief architecture summary. If no findings qualify, say so and identify material areas that were not verified.
