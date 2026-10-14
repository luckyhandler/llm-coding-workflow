#!/usr/bin/env bash
set -euo pipefail

# Starts mlx_lm.server with the configuration from .env (unless it is already
# running) and waits until it is healthy. The MCP server calls this script, so
# it is the single source of truth for mlx_lm.server flags.
#
# MLX is Apple's framework for Apple Silicon; on M5 it uses the per-GPU-core
# Neural Accelerators that llama.cpp's Metal backend cannot reach, and it keeps
# a cross-request prompt cache. That is the prefill win for agent loops.
#
# Usage: scripts/ensure-mlx-server.sh [--restart]
#   --restart  stop any mlx_lm.server running on the configured port and start it
#              again, so .env changes (model, prompt cache, ...) apply

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

RESTART=false
if [ "${1:-}" = "--restart" ]; then
  RESTART=true
fi

# Load .env if present. Variables already set in the environment win, matching
# the MCP server's .env loader.
if [ -f "${REPO_ROOT}/.env" ]; then
  while IFS='=' read -r key value || [ -n "${key}" ]; do
    key="${key//[[:space:]]/}"
    [[ -z "${key}" || "${key}" == \#* ]] && continue
    if [ -z "${!key+x}" ]; then
      value="${value#[\"\']}"
      value="${value%[\"\']}"
      export "${key}=${value}"
    fi
  done < "${REPO_ROOT}/.env"
fi

MLX_BIN="${LOCAL_MLX_BIN:-${HOME}/.local/venvs/mlx-lm/bin/mlx_lm.server}"

# A bare name (no slash) is an HF repo id; a path is resolved against the repo.
resolve_model() {
  if [[ "$1" = /* || "$1" != */* ]]; then echo "$1"; else echo "${REPO_ROOT}/$1"; fi
}

MODEL="${LOCAL_MLX_MODEL:-models/mlx/Qwen3.8-27B-oQ6}"
MODEL="$(resolve_model "${MODEL}")"
DRAFT_MODEL=""
if [ -n "${LOCAL_MLX_DRAFT_MODEL:-}" ]; then
  DRAFT_MODEL="$(resolve_model "${LOCAL_MLX_DRAFT_MODEL}")"
fi

HOST="${LOCAL_MLX_HOST:-127.0.0.1}"
PORT="${LOCAL_MLX_PORT:-8091}"
URL="http://${HOST}:${PORT}"
LOG_FILE="/tmp/mlx-server.log"

TEMP="${LOCAL_MLX_TEMP:-0.7}"
TOP_P="${LOCAL_MLX_TOP_P:-0.8}"
TOP_K="${LOCAL_MLX_TOP_K:-20}"
MIN_P="${LOCAL_MLX_MIN_P:-0.0}"
MAX_TOKENS="${LOCAL_MLX_MAX_TOKENS:-16384}"
PREFILL_STEP_SIZE="${LOCAL_MLX_PREFILL_STEP_SIZE:-2048}"
# A long agent run reuses a stable system prompt + tool schema prefix every step.
# Distinct cached prompts let those prefixes hit instead of re-prefilling.
PROMPT_CACHE_SIZE="${LOCAL_MLX_PROMPT_CACHE_SIZE:-4}"
PROMPT_CACHE_BYTES="${LOCAL_MLX_PROMPT_CACHE_BYTES:-}"
CHAT_TEMPLATE_ARGS="${LOCAL_MLX_CHAT_TEMPLATE_ARGS:-}"
NUM_DRAFT_TOKENS="${LOCAL_MLX_NUM_DRAFT_TOKENS:-3}"
STARTUP_TIMEOUT_SEC="${LOCAL_MLX_STARTUP_TIMEOUT_SEC:-300}"

# mlx_lm.server exposes the OpenAI-compatible /v1/models listing; use it as the
# health probe.
is_healthy() {
  curl --noproxy "*" -s -f "${URL}/v1/models" >/dev/null 2>&1
}

if is_healthy; then
  if [ "${RESTART}" = false ]; then
    echo "mlx_lm.server already running at ${URL}"
    exit 0
  fi
  echo "Stopping mlx_lm.server on ${URL}..."
  # Wait for the old process to exit, not just to stop answering: models can take
  # a while to release their memory, and two loaded models may not fit side by side.
  pkill -f "mlx_lm.server.*--port ${PORT}" || true
  for _ in {1..60}; do
    pgrep -f "mlx_lm.server.*--port ${PORT}" >/dev/null || break
    sleep 1
  done
  pkill -9 -f "mlx_lm.server.*--port ${PORT}" || true
fi

if [ ! -x "${MLX_BIN}" ]; then
  echo "Error: mlx_lm.server not found at ${MLX_BIN}" >&2
  echo "Create the environment with:" >&2
  echo "  uv venv --python 3.12 ~/.local/venvs/mlx-lm && uv pip install --python ~/.local/venvs/mlx-lm/bin/python mlx-lm" >&2
  exit 1
fi

if [[ "${MODEL}" != */* || "${MODEL}" = /* ]]; then
  if [ ! -e "${MODEL}" ]; then
    echo "Error: MLX model not found at ${MODEL}" >&2
    echo "Run 'scripts/download-model.sh <model-key>' or set LOCAL_MLX_MODEL to an HF repo id." >&2
    exit 1
  fi
fi

CMD=(
  "${MLX_BIN}"
  --model "${MODEL}"
  --host "${HOST}"
  --port "${PORT}"
  --temp "${TEMP}"
  --top-p "${TOP_P}"
  --top-k "${TOP_K}"
  --min-p "${MIN_P}"
  --max-tokens "${MAX_TOKENS}"
  --prefill-step-size "${PREFILL_STEP_SIZE}"
  --prompt-cache-size "${PROMPT_CACHE_SIZE}"
)

if [ -n "${PROMPT_CACHE_BYTES}" ]; then
  CMD+=(--prompt-cache-bytes "${PROMPT_CACHE_BYTES}")
fi
if [ -n "${CHAT_TEMPLATE_ARGS}" ]; then
  CMD+=(--chat-template-args "${CHAT_TEMPLATE_ARGS}")
fi
if [ -n "${DRAFT_MODEL}" ]; then
  CMD+=(--draft-model "${DRAFT_MODEL}" --num-draft-tokens "${NUM_DRAFT_TOKENS}")
fi

echo "Starting mlx_lm.server on ${URL} with model: ${MODEL}..."
nohup "${CMD[@]}" > "${LOG_FILE}" 2>&1 &

for _ in $(seq 1 "${STARTUP_TIMEOUT_SEC}"); do
  if is_healthy; then
    echo "mlx_lm.server is healthy at ${URL}"
    exit 0
  fi
  sleep 1
done

echo "Error: mlx_lm.server failed to become healthy within ${STARTUP_TIMEOUT_SEC}s. Check ${LOG_FILE}" >&2
tail -n 20 "${LOG_FILE}" >&2 || true
exit 1
