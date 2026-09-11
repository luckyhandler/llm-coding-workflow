---
description: Delegate a concrete implementation or edit directly to the local agent via MCP
---

The user wants to implement/edit: "$ARGUMENTS"

1. Write a short brief: goal, starting points (files/symbols), constraints, and done criteria. Pick a `check` command that verifies it.
2. Call the `delegate_task` MCP tool with the brief, `cwd` = repository root, and the `check` command.
3. Read the summary; spot-check the diff where needed and follow up with the returned `session_id` if the check fails.
4. Report what changed and how it was verified.
