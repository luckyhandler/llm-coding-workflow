#!/usr/bin/env bash
set -euo pipefail

HOST="${LOCAL_GEMMA_HOST:-127.0.0.1}"
PORT="${LOCAL_GEMMA_PORT:-8090}"
URL="http://${HOST}:${PORT}"
MODEL_PATH="${LOCAL_GEMMA_MODEL_PATH:-/Users/ninohandler/Development/llm-coding-workflow/models/gemma-4-12b-it-qat-q4_0.gguf}"
LOG_FILE="/tmp/llama-server.log"

if curl -s -f "${URL}/health" >/dev/null 2>&1; then
  echo "llama-server already running at ${URL}"
  exit 0
fi

echo "Starting llama-server on ${URL}..."
nohup llama-server \
  --model "${MODEL_PATH}" \
  --host "${HOST}" \
  --port "${PORT}" \
  --n-gpu-layers "${LOCAL_GEMMA_GPU_LAYERS:-99}" \
  --ctx-size "${LOCAL_GEMMA_CTX_SIZE:-65536}" \
  --flash-attn on \
  --threads "${LOCAL_GEMMA_THREADS:-8}" > "${LOG_FILE}" 2>&1 &

for i in {1..30}; do
  if curl -s -f "${URL}/health" >/dev/null 2>&1; then
    echo "llama-server is healthy at ${URL}"
    exit 0
  fi
  sleep 1
done

echo "Error: llama-server failed to become healthy within 30s. Check ${LOG_FILE}" >&2
exit 1
