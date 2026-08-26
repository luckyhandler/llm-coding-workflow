---
name: code-conventions
description: Apply or review shared engineering conventions for code changes across repositories, including naming, readability, typing, dependencies, error handling, tests, generated code, and maintainability. Use alongside repository-specific rules; those rules override this general baseline.
metadata:
  category: code-conventions
  scope: global
  resolution: fallback
---

# Code Conventions

Use the repository's own instructions as the source of truth for language-, framework-, and product-specific decisions. Apply this skill as a portable baseline where the repository is silent.

## Category resolution

This is the global fallback for the `code-conventions` category. Before applying it, search the active repository's skill directories (`.agents/skills`, `.github/skills`, `.claude/skills`, `.cursor/skills`, `.codex/skills`, `.gemini/skills`, and `.opencode/skills`) for a `SKILL.md` whose metadata has `category: code-conventions` and `scope: project`. If exactly one applies, read it first: `resolution: replace` means follow the project skill instead of the remainder of this skill; `resolution: extend` means apply this baseline followed by the project skill. If equally applicable project skills conflict, ask the user which one governs. If none exists, continue with this global skill.

## Baseline

- Keep responsibilities cohesive and dependencies explicit.
- Prefer clear domain names and verb-led operation names over abbreviations or implementation jargon.
- Use the strongest useful types at boundaries; avoid unstructured maps, strings, and flags when a domain type materially improves correctness.
- Validate untrusted input at system boundaries and preserve useful error context without leaking secrets.
- Keep control flow shallow and readable. Extract a unit only when it gains a coherent name or reusable responsibility.
- Prefer existing project abstractions and libraries over introducing parallel mechanisms.
- Keep configuration outside business logic and never hardcode credentials or environment-specific endpoints.
- Do not edit generated files when an authoritative source and generator exist.
- Remove temporary instrumentation, dead code, and comments that merely restate the implementation.

## Change discipline

- Preserve public behavior unless the request changes it.
- Preserve unrelated user changes and avoid opportunistic refactors outside the requested scope.
- Update all affected callers, exports, registration points, schemas, and documentation when changing an interface.
- Add tests for meaningful behavior, boundary conditions, error paths, and regressions. Avoid tests that only repeat constants, framework behavior, or implementation details.
- Use the repository's formatter, analyzer, and test tooling rather than imposing another toolchain.

## Precedence

When guidance conflicts, use this order:

1. The user's explicit requirements.
2. Repository and subtree agent instructions.
3. Repository architecture decisions and documented conventions.
4. Existing local patterns that remain valid.
5. This shared baseline.

When reviewing a change, report only issues introduced or worsened by that change unless the user requests a broader audit.
