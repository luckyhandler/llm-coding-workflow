---
description: Offload code implementation or edits directly to the local model MCP
---

The user wants to implement/edit: "$ARGUMENTS"

1. Structure the required code changes or boilerplate.
2. Call the `implement_with_local_model` MCP tool to generate the implementation, passing the files to edit or follow via `files`.
3. Verify correctness (and inspect the `<local_model_thinking>` block if `thinking: true` was used).
4. Write the resulting files to disk and verify functionality.
