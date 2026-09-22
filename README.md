# Agent-Neutral Coding Workflow

A shared toolkit for consistent engineering workflows across Agent Skills-compatible clients. It includes portable skills for commits, feature planning, QA, conventions, architecture review, and explicit implementation offload to a local coding agent.

## Shared agent skills

Canonical skills live in `agent-skills/`:

- `commit` — inspect, validate, stage, and create focused commits without pushing.
- `feature-plan` — produce repository-grounded implementation plans without coding.
- `qa-check` — discover and run the current repository's actual quality gates.
- `code-conventions` — shared engineering baseline, subordinate to repository rules.
- `architecture-review` — architecture-focused review against local decisions.
- `local-model-implementation` — explicitly delegate an already-planned implementation to the local coding agent to save the primary agent's tokens.

The skills use the portable `SKILL.md` format and contain no dependency on a particular frontier agent. Repository-specific architecture, commands, scopes, and exceptions remain in each repository's `AGENTS.md` and linked documentation.

### Skill categories and project fallback

Every canonical skill declares three portable metadata values:

```yaml
metadata:
  category: quality-assurance
  scope: global
  resolution: fallback
```

Allowed categories are defined by `agent-skills/categories.txt`. They form stable resolution slots:

| Category | Global fallback |
|---|---|
| `architecture` | `architecture-review` |
| `code-conventions` | `code-conventions` |
| `commit` | `commit` |
| `feature-planning` | `feature-plan` |
| `implementation` | `local-model-implementation` |
| `quality-assurance` | `qa-check` |

A project can override a category with any skill name by placing a tagged `SKILL.md` in one of its project skill directories, preferably `.agents/skills/<name>/SKILL.md`:

```yaml
---
name: pyt-qa-check
description: Run the Park Your Truck quality gates.
metadata:
  category: quality-assurance
  scope: project
  resolution: replace
---
```

Use `resolution: replace` when the project skill is complete, or `resolution: extend` when it adds project-specific requirements after the global baseline. The global skills actively search for these category tags, so fallback does not depend on an individual client's skill-name precedence. A project should define at most one applicable skill per category and scope; equally applicable conflicts require an explicit choice.

Install or refresh all skills through symlinks:

```bash
./scripts/install-agent-skills.sh
./scripts/validate-agent-skills.sh
```

Use `./scripts/install-agent-skills.sh --dry-run` to inspect the target locations first. The installer exposes the same canonical directories to the shared Agent Skills location and the supported client-specific locations; it refuses to replace an existing file, directory, or unrelated symlink.

## Architecture

```
Claude Code / Opus / Codex / Hermes
  → planning
  → architecture
  → review / critique
        ↓  (explicit /offload command → delegate_task)
Local coding agent — OpenCode + Qwen3.8-27B on llama.cpp (via local-gemma MCP)
  → navigates with LSP / grep, edits, runs the check
  → returns a short summary instead of code
```

## Setup & Integration

The `local-gemma` MCP server (`mcp-server/server.js`, details in `mcp-server/README.md`) exposes:
- `delegate_task`: runs a local coding agent ([OpenCode](https://opencode.ai), `brew install opencode`, configured by `agent-worker/opencode.json`) in a git repository. It navigates with LSP and grep, edits files, and iterates on a `check` command; the caller gets a short summary (outcome, check result, changed files, notes, undo command, session id) instead of code. This is the token-saving path.
- `implement_with_local_model`: one-shot generation that returns code (no token savings; for when you need code back).
- `local_model_status`: checks health of the local server and which model it has loaded.

Both generating tools auto-boot `llama-server` on the Apple Silicon Metal GPU via `scripts/ensure-llama-server.sh`.

MCP clients enforce their own tool-call timeouts. A delegation can take up to its 30-minute budget plus the check, so registrations set 60 minutes: Claude Code `"timeout": 3600000` (milliseconds; values below 1000 are ignored), Codex `tool_timeout_sec = 3600`.

## Hardware Profiling & Setup (Mac)

Before running the workflow on a new laptop, run the benchmark and configuration profiler:

```bash
# Detect hardware and view recommended model and flags
./scripts/benchmark-and-configure.sh --dry-run

# Automatically apply optimal settings to .env
./scripts/benchmark-and-configure.sh --apply

# Optionally download missing recommended model
./scripts/download-model.sh <model-key>
```

### Supported Hardware Tiers
- **Entry (≤8GB Unified RAM)**: Gemma 2B / 4B Q4_K_M (16K context, 4 threads)
- **Mid-Range (16GB–24GB Unified RAM)**: Gemma 4 12B Q4_0 / 9B Q4_K_M (32K context)
- **High Performance (32GB–48GB Unified RAM)**: Gemma 4 12B Q4_0 (64K context, 8 Performance cores)
- **Workstation (≥64GB Unified RAM)**: Qwen3.6-35B-A3B UD-Q4_K_XL (sparse MoE, ~3B active) with `ngram-mod,draft-mtp` speculative decoding using the model's embedded MTP head (128K context; ~106 tok/s decode, ~1218 tok/s prefill on an M5 Max)

After changing `.env`, run `./scripts/ensure-llama-server.sh --restart` so a running server picks up the new settings.

## Overnight runs

`delegate_task` runs one brief for up to 30 minutes and, on a detected loop,
*kills* the agent. To work a whole plan unattended, use the overnight runner,
which drives many briefs in sequence:

```bash
node mcp-server/overnight.js evals/plans/example.md --commit --max-hours 8
```

Write the plan during the day as markdown (`## Task:` blocks, see
`evals/plans/example.md`); each task carries its own `check`, `max_minutes`,
`retries`, and `protect` globs. What the runner adds over `delegate_task`:

- **Verify + retry** — a failing check or a loop-kill ends an *attempt*, not the
  run; the next attempt's brief is prefixed with the previous failure and the
  check output, and is told to change approach.
- **Resume** — state is written after every attempt, so a reboot, a crash, or
  Ctrl-C resumes where it stopped; passed tasks are skipped.
- **Integrity** — `protect:` files (tests, fixtures) are restored if the agent
  edits them or creates new files matching the glob, and the check is re-run
  before the pass is accepted. Without this, an agent can pass by weakening or
  fabricating a test.
- **Checkpoints** — `--commit` commits each verified task, so the morning diff is
  a stack of revertible commits.
- **Morning report** — `<plan>.report.md` summarises pass/fail, attempts, changed
  files, and the last check output per failed task.

Run `--dry-run` first to confirm the parsed tasks and their checks.

## Model evaluation

`mcp-server/eval.js` runs the tasks under `evals/tasks/` through the real
`delegate_task` harness, so a model comparison reflects navigation, edits, and
iterating on a check rather than raw token speed. Each task is a small repo with
a `check.sh`; test files are restored and the check re-run before a pass counts,
so weakening tests does not score.

```bash
node mcp-server/eval.js --base-url http://127.0.0.1:8090/v1 --label my-model
```

Measured on an M5 Max 64GB (Qwen3.8-27B Q6_K vs Qwen3.6-35B-A3B UD-Q4_K_XL, both
llama.cpp with `draft-mtp,ngram-mod`):

| Model | Prefill | Decode | Eval |
|---|---|---|---|
| Qwen3.8-27B Q6_K (dense, 25.3 GB) | 360 tok/s | 41.4 tok/s | 4/4, 82s |
| Qwen3.6-35B-A3B UD-Q4_K_XL (MoE, 22.9 GB) | 1218 tok/s | 106 tok/s | 4/4, 57s |

The MoE's ~3B active parameters make it 2.6–3.4x faster; both passed every task,
so the suite shows a speed win but not a capability difference. `Qwen3-Coder-Next`
needs ~50 GB even at Q4 and does not fit with usable context on 64 GB. See
[`docs/local-inference.md`](docs/local-inference.md) for the full method, the
measurement traps, and why MLX lost.

## Runtime backends (llama.cpp vs MLX)

The worker model can be served by either runtime; the harness above it is unchanged.
The measurements and the reasoning behind the default live in
[`docs/local-inference.md`](docs/local-inference.md).

| | `llama` (default) | `mlx` |
|---|---|---|
| Engine | `llama-server` (GGUF) | `mlx_lm.server` (MLX safetensors) |
| Port | 8090 | 8091 |
| M5 Neural Accelerators | not used | **used** (~3–4x prefill) |
| Cross-request prompt cache | slot prompt reuse | `--prompt-cache-size` |
| Setup | `llama.cpp` | `uv venv --python 3.12 ~/.local/venvs/mlx-lm && uv pip install --python ~/.local/venvs/mlx-lm/bin/python mlx-lm` |

MLX cannot load GGUF — it needs MLX-format weights (a local directory or a Hugging Face repo id):

```bash
~/.local/venvs/mlx-lm/bin/hf download mlx-community/Qwen3.8-27B-oQ6 \
  --local-dir models/mlx/Qwen3.8-27B-oQ6
```

Switch backends in `.env` (`LOCAL_MLX_*` keys hold the MLX model, port, and sampling):

```bash
LOCAL_BACKEND=mlx
```

Then restart the server so the change applies:

```bash
./scripts/ensure-mlx-server.sh --restart     # or ensure-llama-server.sh --restart
```

Decode speed on a dense model is bounded by memory bandwidth (`614 GB/s ÷ model size` on an M5 Max), so MLX mainly buys prefill and prompt-cache wins at equal quantization. To move decode, lower the bit width (e.g. `Qwen3.8-27B-oQ4`) or use a sparse MoE model, whose active parameters are a fraction of its total.

Compare the two runtimes on identical work:

```bash
./scripts/benchmark-local-models.sh --url http://127.0.0.1:8091/v1   # MLX
./scripts/benchmark-local-models.sh --url http://127.0.0.1:8090/v1   # llama.cpp
```

### Measured outcome (M5 Max 64GB, Qwen3.8-27B)

Identical 48k-token prompt for prefill and identical novel prose for decode:

| Runtime | Prefill | Decode |
|---|---|---|
| llama.cpp, Q6_K GGUF, `draft-mtp,ngram-mod` | 360 tok/s | **41.4 tok/s** |
| MLX (`mlx_lm.server`), oQ6, no speculation | **519 tok/s** | 19.7 tok/s |
| MLX (`mlx_vlm.server`), oQ6 + MTP drafter (71% acceptance) | 456 tok/s | 17.4 tok/s |

**llama.cpp stays the default.** Decode dominates an agent's wall clock, and MLA/MLX speculative decoding loses it by ~2.4x: MLX's per-draft-round overhead eats the gain even at 71% draft acceptance and block size 3. MLX wins prefill, but prompt caching absorbs most repeated prefixes in an agent loop. MLX also peaked at 47 GB for a trivial request, which is a real OOM risk during long overnight contexts on 64 GB.

Keep `LOCAL_BACKEND=mlx` only as an experiment. The MTP drafter is an `mlx-vlm` feature (`--draft-model … --draft-kind mtp`), not `mlx-lm`; `mlx-vlm` resolves the request `model` field to a repo id, so a caller must send the exact `--model` string it was started with.

Only one backend can be resident at a time: loading both exceeds 64 GB and kills a request with a Metal out-of-memory error.

## Registered frontends
- **Claude Code**: `~/.claude.json`
- **Claude Desktop**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Hermes**: `~/.hermes/config.yaml`
- **Codex CLI**: `~/.codex/config.toml`

## Usage

In your agent frontend (e.g. Claude Code):
- Work normally for standard conversation and coding.
- Trigger explicit local delegation with:
  ```text
  /offload <task description>
  ```
  or
  ```text
  /local-implement <task description>
  ```
