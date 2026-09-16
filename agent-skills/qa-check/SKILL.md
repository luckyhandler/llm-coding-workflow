---
name: qa-check
description: Run and report repository quality checks such as formatting, static analysis, tests, builds, generated-code verification, and relevant integration checks. Use for QA, validation, pre-commit checks, or investigating failing gates; do not change code unless fixes are requested or clearly part of the task.
metadata:
  category: quality-assurance
  scope: global
  resolution: fallback
---

# QA Check

Validate the repository using its own documented quality gates.

## Category resolution

This is the global fallback for the `quality-assurance` category. Before applying it, search the active repository's skill directories (`.agents/skills`, `.github/skills`, `.claude/skills`, `.cursor/skills`, `.codex/skills`, `.gemini/skills`, and `.opencode/skills`) for a `SKILL.md` whose metadata has `category: quality-assurance` and `scope: project`. If exactly one applies, read it first: `resolution: replace` means follow the project skill instead of the remainder of this skill; `resolution: extend` means apply this baseline followed by the project skill. If equally applicable project skills conflict, ask the user which one governs. If none exists, continue with this global skill.

## Discover the gates

1. Read the repository's agent instructions and contribution or testing documentation.
2. Inspect scripts, task runners, package manifests, workspace configuration, and CI workflows.
3. Determine the affected projects from the current change set or the user's stated scope.
4. Prefer repository wrappers over reconstructing their underlying commands.

Typical gate categories are formatting, lint or static analysis, unit tests, integration tests, builds, generated-code freshness, schema validation, and migration checks. Run only categories supported by the repository and proportionate to the change.

## Execute

- Capture the exact command, exit status, and meaningful failure evidence for each gate.
- Do not interrupt a running check. Use separate execution sessions for safe parallelism when available.
- Treat a failing test as evidence of a possible production regression. Understand the intended behavior before changing either source or test code.
- Do not silently skip a required gate because a dependency or service is unavailable. Report the concrete blocker and any narrower checks that still ran.
- If fixes are authorized, keep them scoped to diagnosed failures and rerun the failed gate. After all fixes, rerun any broader gate whose result may have been invalidated.

## Report

Report each applicable gate as passed, failed, blocked, or not applicable. Include:

- scope checked;
- fixes made, if authorized;
- tests changed and why, if any;
- remaining failures or environmental blockers;
- checks not run and the reason.

Never claim success from partial output or without confirming successful completion.
