#!/usr/bin/env bash
set -euo pipefail

# Measures prompt-processing (prefill) and token-generation (decode) throughput
# of any running OpenAI-compatible local server over HTTP. It talks to the
# server, not the engine, so llama.cpp and MLX are compared on identical work:
# prefill dominates an agent's time-to-first-answer, decode dominates its total
# wall clock.
#
# Usage:
#   scripts/benchmark-local-models.sh [--url URL] [--model NAME]
#                                     [--prefill-tokens N] [--decode-tokens N] [--runs N]
#
#   URL defaults to the MLX server on :8091; pass the llama.cpp URL to compare.
#   NAME defaults to whatever the server reports via GET /v1/models.

URL="http://127.0.0.1:8091/v1"
MODEL=""
PREFILL_TOKENS=8000
DECODE_TOKENS=256
RUNS=2

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --prefill-tokens) PREFILL_TOKENS="$2"; shift 2 ;;
    --decode-tokens) DECODE_TOKENS="$2"; shift 2 ;;
    --runs) RUNS="$2"; shift 2 ;;
    --help|-h) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if ! curl --noproxy "*" -s -f "${URL}/models" >/dev/null 2>&1; then
  echo "Error: no OpenAI-compatible server responding at ${URL}/models" >&2
  exit 1
fi

BENCH_URL="${URL}" BENCH_MODEL="${MODEL}" \
BENCH_PREFILL="${PREFILL_TOKENS}" BENCH_DECODE="${DECODE_TOKENS}" BENCH_RUNS="${RUNS}" \
python3 - <<'PY'
import json, os, random, time, urllib.request

url = os.environ["BENCH_URL"].rstrip("/")
prefill_tokens = int(os.environ["BENCH_PREFILL"])
decode_tokens = int(os.environ["BENCH_DECODE"])
runs = int(os.environ["BENCH_RUNS"])

def get(path):
    return json.load(urllib.request.urlopen(url + path, timeout=30))

model = os.environ["BENCH_MODEL"] or get("/models")["data"][0]["id"]

def complete(prompt, max_tokens, nonce=""):
    # A nonce at the very start of the message makes every prompt a cache miss,
    # so prefill measures real prompt processing instead of a prompt-cache hit.
    content = f"[run {nonce}] {prompt}" if nonce else prompt
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": content}],
        "max_tokens": max_tokens,
        "temperature": 0.0,
        "chat_template_kwargs": {"enable_thinking": False},
    }).encode()
    req = urllib.request.Request(url + "/chat/completions", data=body,
                                 headers={"Content-Type": "application/json"})
    started = time.time()
    resp = json.load(urllib.request.urlopen(req, timeout=1800))
    elapsed = time.time() - started
    usage = resp.get("usage", {})
    return usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), elapsed

# Unique random tokens: repeated filler would let prompt caching and ngram-style
# speculation shortcut the work, inflating prefill and decode both.
filler = " ".join(f"{random.randrange(10**9):09d}" for _ in range((prefill_tokens * 6) // 10 + 1))
prefill_prompt = "Summarise the numbers below in one short sentence.\n\n" + filler

print(f"model: {model}")
print(f"{'test':<10} {'runs':>4} {'prompt_tok':>10} {'compl_tok':>9} {'wall_s':>7} {'prefill_tok/s':>13} {'decode_tok/s':>12}")

# Prefill: long prompt, tiny output. Roughly all wall time is prompt processing
# for a 1-token answer. Each run gets a fresh nonce so the cache never hits.
best_prefill = 0.0
p_long = 0
for run in range(runs):
    p, c, elapsed = complete(prefill_prompt, 1, nonce=f"prefill-{run}")
    rate = p / elapsed if elapsed > 0 else 0
    best_prefill = max(best_prefill, rate)
    p_long = p
print(f"{'prefill':<10} {runs:>4} {p_long:>10} {1:>9} {'-':>7} {best_prefill:>13.0f} {'-':>12}")

# Decode: trivial prompt, generate a long answer. Prefill is negligible here.
best_decode = 0.0
best_c = 0
best_elapsed = 0.0
# Varied, code-like output: highly repetitive text ("count upward") lets
# speculative decoding accept almost every draft, which inflates decode far
# beyond what real agent work sees.
decode_prompt = (
    "Write several distinct paragraphs explaining the causes of the decline of "
    "the Roman Empire, with specific dates and names. Vary your phrasing."
)
for run in range(runs):
    p, c, elapsed = complete(decode_prompt, decode_tokens, nonce=f"decode-{run}")
    rate = c / elapsed if elapsed > 0 else 0
    if rate > best_decode:
        best_decode, best_c, best_elapsed = rate, c, elapsed
print(f"{'decode':<10} {runs:>4} {'0':>10} {best_c:>9} {best_elapsed:>7.1f} {'-':>13} {best_decode:>12.1f}")

print()
print("prefill = prompt-processing throughput (dominates first-token latency in agent loops)")
print("decode  = token-generation throughput (dominates total wall clock)")
PY
