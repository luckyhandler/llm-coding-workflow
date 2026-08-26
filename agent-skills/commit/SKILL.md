---
name: commit
description: Create focused, well-formed Git commits when the user explicitly asks to commit, stage changes, or prepare commit messages. Adapts to the current repository's documented workflow and never pushes unless separately requested.
metadata:
  category: commit
  scope: global
  resolution: fallback
---

# Commit

Create commits that preserve the user's work and the repository's history conventions.

## Category resolution

This is the global fallback for the `commit` category. Before applying it, search the active repository's skill directories (`.agents/skills`, `.github/skills`, `.claude/skills`, `.cursor/skills`, `.codex/skills`, `.gemini/skills`, and `.opencode/skills`) for a `SKILL.md` whose metadata has `category: commit` and `scope: project`. If exactly one applies, read it first: `resolution: replace` means follow the project skill instead of the remainder of this skill; `resolution: extend` means apply this baseline followed by the project skill. If equally applicable project skills conflict, ask the user which one governs. If none exists, continue with this global skill.

## Workflow

1. Read the repository's agent instructions and documented Git workflow when present.
2. Inspect the complete status and diff, including staged, unstaged, and intentional untracked files.
3. Separate unrelated concerns. If committing them together would hide meaningful boundaries, propose the split before committing.
4. Check for secrets, generated artifacts, vendored dependencies, debug output, and unrelated user changes. Do not stage suspicious files.
5. Run the smallest relevant quality checks defined by the repository. Do not invent a heavyweight full-suite requirement for a trivial documentation-only change.
6. Stage explicit paths. Avoid broad staging when unrelated changes exist.
7. Derive the message from the staged diff and the repository's conventions. Prefer a short imperative subject; add a body only when the reason or migration impact is not apparent.
8. Verify the resulting commit and report its identifier, subject, included scope, and checks run.

## Safety boundaries

- A request for a commit does not authorize a push, merge, tag, release, rebase, history rewrite, or branch deletion.
- Never discard or overwrite unrelated changes to make the worktree clean.
- Never bypass hooks or quality gates unless the user explicitly authorizes it after seeing the failure.
- Do not add AI attribution or assistant co-author trailers.
- If the repository requires Conventional Commits, project scopes, sign-off, or a branch policy, follow its documented rules rather than imposing a universal format.
