#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Load .env if present
if [ -f "${REPO_ROOT}/.env" ]; then
  set -a
  source "${REPO_ROOT}/.env"
  set +a
fi

HOST="${LOCAL_GEMMA_HOST:-127.0.0.1}"
PORT="${LOCAL_GEMMA_PORT:-8090}"
URL="http://${HOST}:${PORT}"

MODEL_REL_OR_ABS="${LOCAL_GEMMA_MODEL_PATH:-models/gemma-4-12b-it-qat-q4_0.gguf}"
if [[ "${MODEL_REL_OR_ABS}" = /* ]]; then
  MODEL_PATH="${MODEL_REL_OR_ABS}"
else
  MODEL_PATH="${REPO_ROOT}/${MODEL_REL_OR_ABS}"
fi

LOG_FILE="/tmp/llama-server.log"
GPU_LAYERS="${LOCAL_GEMMA_GPU_LAYERS:-99}"
CTX_SIZE="${LOCAL_GEMMA_CTX_SIZE:-65536}"
THREADS="${LOCAL_GEMMA_THREADS:-8}"
BATCH_SIZE="${LOCAL_GEMMA_BATCH_SIZE:-2048}"
UBATCH_SIZE="${LOCAL_GEMMA_UBATCH_SIZE:-512}"
FLASH_ATTN="${LOCAL_GEMMA_FLASH_ATTN:-on}"

if curl --noproxy "*" -s -f "${URL}/health" >/dev/null 2>&1; then
  echo "llama-server already running at ${URL}"
  exit 0
fi

if [ ! -f "${MODEL_PATH}" ]; then
  echo "Error: Model file not found at ${MODEL_PATH}" >&2
  echo "Run 'scripts/benchmark-and-configure.sh' to benchmark hardware and provision models." >&2
  exit 1
fi

echo "Starting llama-server on ${URL} with model: ${MODEL_PATH}..."
nohup llama-server \
  --model "${MODEL_PATH}" \
  --host "${HOST}" \
  --port "${PORT}" \
  --n-gpu-layers "${GPU_LAYERS}" \
  --ctx-size "${CTX_SIZE}" \
  --flash-attn "${FLASH_ATTN}" \
  --batch-size "${BATCH_SIZE}" \
  --ubatch-size "${UBATCH_SIZE}" \
  --threads "${THREADS}" > "${LOG_FILE}" 2>&1 &

for i in {1..30}; do
  if curl --noproxy "*" -s -f "${URL}/health" >/dev/null 2>&1; then
    echo "llama-server is healthy at ${URL}"
    exit 0
  fi
  sleep 1
done

echo "Error: llama-server failed to become healthy within 30s. Check ${LOG_FILE}" >&2
exit 1
