#!/usr/bin/env bash
set -euo pipefail

# Starts llama-server with the configuration from .env (unless it is already
# running) and waits until it is healthy. The MCP server calls this script, so
# it is the single source of truth for llama-server flags.
#
# Usage: scripts/ensure-llama-server.sh [--restart]
#   --restart  stop any llama-server running on the configured port and start it
#              again, so .env changes (model, speculative decoding, ...) apply

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

resolve_path() {
  if [[ "$1" = /* ]]; then echo "$1"; else echo "${REPO_ROOT}/$1"; fi
}

HOST="${LOCAL_GEMMA_HOST:-127.0.0.1}"
PORT="${LOCAL_GEMMA_PORT:-8090}"
URL="http://${HOST}:${PORT}"

MODEL_PATH="$(resolve_path "${LOCAL_GEMMA_MODEL_PATH:-models/gemma-4-12b-it-qat-q4_0.gguf}")"
DRAFT_MODEL_PATH=""
if [ -n "${LOCAL_GEMMA_DRAFT_MODEL_PATH:-}" ]; then
  DRAFT_MODEL_PATH="$(resolve_path "${LOCAL_GEMMA_DRAFT_MODEL_PATH}")"
fi

LOG_FILE="/tmp/llama-server.log"
GPU_LAYERS="${LOCAL_GEMMA_GPU_LAYERS:-99}"
CTX_SIZE="${LOCAL_GEMMA_CTX_SIZE:-65536}"
PARALLEL="${LOCAL_GEMMA_PARALLEL:-1}"
THREADS="${LOCAL_GEMMA_THREADS:-8}"
BATCH_SIZE="${LOCAL_GEMMA_BATCH_SIZE:-2048}"
UBATCH_SIZE="${LOCAL_GEMMA_UBATCH_SIZE:-512}"
FLASH_ATTN="${LOCAL_GEMMA_FLASH_ATTN:-on}"
CACHE_TYPE_K="${LOCAL_GEMMA_CACHE_TYPE_K:-}"
CACHE_TYPE_V="${LOCAL_GEMMA_CACHE_TYPE_V:-}"
SPEC_TYPE="${LOCAL_GEMMA_SPEC_TYPE:-}"
SPEC_DRAFT_N_MAX="${LOCAL_GEMMA_SPEC_DRAFT_N_MAX:-}"
STARTUP_TIMEOUT_SEC="${LOCAL_GEMMA_STARTUP_TIMEOUT_SEC:-180}"

if curl --noproxy "*" -s -f "${URL}/health" >/dev/null 2>&1; then
  LOADED_MODEL="$(curl --noproxy "*" -s "${URL}/props" | sed -n 's/.*"model_path":"\([^"]*\)".*/\1/p')"
  if [ "${RESTART}" = false ]; then
    if [ -n "${LOADED_MODEL}" ] && [ "${LOADED_MODEL}" != "${MODEL_PATH}" ]; then
      echo "Warning: llama-server at ${URL} serves ${LOADED_MODEL}, but .env configures ${MODEL_PATH}." >&2
      echo "Run 'scripts/ensure-llama-server.sh --restart' to switch models." >&2
    else
      echo "llama-server already running at ${URL}"
    fi
    exit 0
  fi
  echo "Stopping llama-server serving ${LOADED_MODEL:-unknown model}..."
  # Wait for the old process to exit, not just to stop answering: it can take a
  # while to release its memory, and two loaded models may not fit side by side.
  pkill -f "llama-server.*--port ${PORT}" || true
  for _ in {1..60}; do
    pgrep -f "llama-server.*--port ${PORT}" >/dev/null || break
    sleep 1
  done
  pkill -9 -f "llama-server.*--port ${PORT}" || true
fi

if [ ! -f "${MODEL_PATH}" ]; then
  echo "Error: Model file not found at ${MODEL_PATH}" >&2
  echo "Run 'scripts/benchmark-and-configure.sh' to benchmark hardware and provision models." >&2
  exit 1
fi

CMD=(
  llama-server
  --model "${MODEL_PATH}"
  --host "${HOST}"
  --port "${PORT}"
  --n-gpu-layers "${GPU_LAYERS}"
  --ctx-size "${CTX_SIZE}"
  --parallel "${PARALLEL}"
  --flash-attn "${FLASH_ATTN}"
  --batch-size "${BATCH_SIZE}"
  --ubatch-size "${UBATCH_SIZE}"
  --threads "${THREADS}"
)

if [ -n "${CACHE_TYPE_K}" ]; then
  CMD+=(--cache-type-k "${CACHE_TYPE_K}")
fi
if [ -n "${CACHE_TYPE_V}" ]; then
  CMD+=(--cache-type-v "${CACHE_TYPE_V}")
fi
if [ -n "${SPEC_TYPE}" ]; then
  CMD+=(--spec-type "${SPEC_TYPE}")
fi
if [ -n "${SPEC_DRAFT_N_MAX}" ]; then
  CMD+=(--spec-draft-n-max "${SPEC_DRAFT_N_MAX}")
fi
if [ -n "${DRAFT_MODEL_PATH}" ]; then
  if [ ! -f "${DRAFT_MODEL_PATH}" ]; then
    echo "Error: Draft model file not found at ${DRAFT_MODEL_PATH}" >&2
    exit 1
  fi
  CMD+=(--spec-draft-model "${DRAFT_MODEL_PATH}")
fi

echo "Starting llama-server on ${URL} with model: ${MODEL_PATH}..."
nohup "${CMD[@]}" > "${LOG_FILE}" 2>&1 &

for _ in $(seq 1 "${STARTUP_TIMEOUT_SEC}"); do
  if curl --noproxy "*" -s -f "${URL}/health" >/dev/null 2>&1; then
    echo "llama-server is healthy at ${URL}"
    exit 0
  fi
  sleep 1
done

echo "Error: llama-server failed to become healthy within ${STARTUP_TIMEOUT_SEC}s. Check ${LOG_FILE}" >&2
tail -n 20 "${LOG_FILE}" >&2 || true
exit 1
