# Local inference: runtime and model selection

Record of why the local worker runs on llama.cpp with a sparse MoE model, and
why the Apple MLX backend was evaluated and rejected. Re-run any number below
with the scripts named at the end.

## Hardware baseline

| | |
|---|---|
| Chip | Apple M5 Max, 18 cores |
| Unified memory | 64 GB |
| Memory bandwidth | ~614 GB/s |

Decode (token generation) is memory-bandwidth bound: generating one token
requires reading every weight that participates in it. So the achievable decode
rate has a hard ceiling of `bandwidth ÷ bytes-read-per-token`.

For the dense 27B model at Q6 (~25.3 GB read per token):

```
614 GB/s ÷ 25.3 GB ≈ 24 tok/s
```

Every runtime sits at that wall unless it can emit more than one token per pass,
which is what speculative decoding does: draft several tokens cheaply, then
verify them in a single batched forward pass. Speculation is the only way past
the wall, and it is why the runtime comparison below is really a comparison of
speculative-decoding stacks.

## Benchmark method

`scripts/benchmark-local-models.sh` measures through the HTTP API, so llama.cpp
and MLX are compared on identical work:

- **Prefill** — a long, unique (random-number) prompt with a 1-token answer. A
  unique prompt defeats prompt caching, so this is real prompt processing.
- **Decode** — a novel prose prompt generating 256 tokens.

Two measurement traps were found and are guarded against:

- **Prompt caching** inflates prefill by up to two orders of magnitude: a
  repeated prompt returns almost instantly. Each run gets a fresh nonce so the
  cache never hits.
- **Speculative decoding exploits repetition.** A "count upward" prompt is a
  pathological best case: llama accepted 99.6% of drafts and reported 148 tok/s,
  which no real workload sees. The decode prompt is deliberately varied prose,
  where llama's draft acceptance is ~0.49. Even so, decode rate is
  workload-dependent, so treat these as orders of magnitude, not exact figures.

## Runtime comparison

Identical 48k-token prefill prompt and identical novel-prose decode, M5 Max 64GB,
dense Qwen3.8-27B:

| Runtime | Prefill | Decode |
|---|---|---|
| llama.cpp, Q6_K GGUF, `draft-mtp,ngram-mod` | 360 tok/s | **41.4 tok/s** |
| MLX (`mlx_lm.server`), oQ6, no speculation | 519 tok/s | 19.7 tok/s |
| MLX (`mlx_vlm.server`), oQ6 + MTP drafter | 456 tok/s | 17.4 tok/s |

The MTP drafter was genuinely working in the third row — `draft_kind: mtp`,
71% of drafts accepted, block size 3 — and still lost.

## Why MLX lost

1. **llama.cpp had speculative decoding; `mlx-lm` did not.** The GGUF embeds an
   MTP head and `ngram-mod` adds prompt-lookup drafting, which together lift
   decode from the ~24 tok/s ceiling to 41.4. `mlx-lm` has no MTP path, so it sat
   at the wall (19.7).

2. **`mlx-vlm`'s MTP is too expensive per round.** Each draft round pays a
   separate drafter forward pass plus a target verification pass. When that round
   costs roughly two ordinary steps, speculation nets out to nothing despite 71%
   acceptance. Result: 17.4 tok/s, worse than no speculation.

3. **MLX's real advantage is prefill, not decode.** The M5 Neural Accelerators,
   which only MLX reaches, gave 519 vs 360 tok/s on prompt processing. But in an
   agent loop prompt caching absorbs the repeated prefixes, so prefill is a
   smaller share of wall clock than decode. The win landed where it mattered
   least.

4. **Memory headroom.** `mlx-vlm` peaked at 47 GB on a trivial request, which is
   a real OOM risk for long overnight contexts on a 64 GB machine.

This is a **tooling-maturity gap, not a hardware verdict.** MLX already wins
prefill; if `mlx-lm` gains an efficient native MTP, MLX would take both metrics
and the default should be revisited. Until then the llama.cpp spec-decoding
stack is the difference.

Also worth knowing: only one backend can be resident at a time. Loading llama
(~30 GB with KV) and MLX (~23 GB) together exceeded 64 GB and killed a request
with a Metal out-of-memory error, so `LOCAL_BACKEND` selects exactly one.

## Model selection: dense vs sparse MoE

The dense model's decode is capped by bandwidth because all ~25 GB of weights is
read per token. A sparse Mixture-of-Experts model routes each token to a small
subset of experts, so only a fraction of parameters participates:

- `Qwen3.8-27B` (dense): ~27B parameters, all active per token.
- `Qwen3.6-35B-A3B` (MoE): 35B total, ~3B active per token.

| Model | Prefill | Decode | Eval (4 tasks) |
|---|---|---|---|
| Qwen3.8-27B Q6_K (dense, 25.3 GB) | 360 tok/s | 41.4 tok/s | 4/4 pass, 82s |
| Qwen3.6-35B-A3B UD-Q4_K_XL (MoE, 22.9 GB) | **1218 tok/s** | **106 tok/s** | 4/4 pass, 57s |

The MoE reads far fewer weights per token, so it clears the bandwidth wall by
architecture rather than by speculation — a bigger and more robust win than any
runtime swap. It is now the default for the ≥64 GB tier.

Caveats recorded honestly:

- **Capability is not proven.** Both models passed every eval task, so the suite
  demonstrates a speed advantage, not a capability advantage. A stronger claim
  needs harder or more numerous tasks.
- **`Qwen3-Coder-Next` does not fit.** Its MoE is ~50 GB even at Q4, leaving no
  room for usable context on 64 GB.

## How to reproduce

```bash
# Compare runtimes on identical work
scripts/benchmark-local-models.sh --url http://127.0.0.1:8090/v1   # llama.cpp
scripts/benchmark-local-models.sh --url http://127.0.0.1:8091/v1   # MLX

# Compare models on real tasks through the delegate harness
node mcp-server/eval.js --base-url http://127.0.0.1:8090/v1 --label my-model

# Switch runtime (.env), then restart the matching server
LOCAL_BACKEND=mlx ./scripts/ensure-mlx-server.sh --restart
LOCAL_BACKEND=llama ./scripts/ensure-llama-server.sh --restart
```

MLX needs MLX-format weights (a local directory or a Hugging Face repo id);
llama.cpp cannot load them and MLX cannot load GGUF.

```bash
uv venv --python 3.12 ~/.local/venvs/mlx-lm
uv pip install --python ~/.local/venvs/mlx-lm/bin/python mlx-lm
~/.local/venvs/mlx-lm/bin/hf download mlx-community/Qwen3.8-27B-oQ6 \
  --local-dir models/mlx/Qwen3.8-27B-oQ6
```
