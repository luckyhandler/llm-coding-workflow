#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MODELS_DIR="${REPO_ROOT}/models"

mkdir -p "${MODELS_DIR}"

declare -A MODEL_URLS=(
  ["gemma-2b-q4_k_m"]="https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf"
  ["gemma-9b-q4_k_m"]="https://huggingface.co/bartowski/gemma-2-9b-it-GGUF/resolve/main/gemma-2-9b-it-Q4_K_M.gguf"
  ["gemma-4-12b-qat-q4_0"]="https://huggingface.co/google/gemma-4-12b-it-qat-q4_0-gguf/resolve/main/gemma-4-12b-it-qat-q4_0.gguf"
  ["gemma-27b-q4_k_m"]="https://huggingface.co/bartowski/gemma-2-27b-it-GGUF/resolve/main/gemma-2-27b-it-Q4_K_M.gguf"
  ["gemma-27b-q8_0"]="https://huggingface.co/bartowski/gemma-2-27b-it-GGUF/resolve/main/gemma-2-27b-it-Q8_0.gguf"
)

declare -A MODEL_FILENAMES=(
  ["gemma-2b-q4_k_m"]="gemma-2-2b-it-Q4_K_M.gguf"
  ["gemma-9b-q4_k_m"]="gemma-2-9b-it-Q4_K_M.gguf"
  ["gemma-4-12b-qat-q4_0"]="gemma-4-12b-it-qat-q4_0.gguf"
  ["gemma-27b-q4_k_m"]="gemma-2-27b-it-Q4_K_M.gguf"
  ["gemma-27b-q8_0"]="gemma-2-27b-it-Q8_0.gguf"
)

MODEL_KEY="${1:-}"

if [ -z "${MODEL_KEY}" ]; then
  echo "Usage: $0 <model-key|direct-url> [custom-filename]"
  echo ""
  echo "Available model keys:"
  for key in "${!MODEL_URLS[@]}"; do
    echo "  - ${key} -> ${MODEL_FILENAMES[${key}]}"
  done
  exit 1
fi

if [[ -n "${MODEL_URLS[${MODEL_KEY}]+x}" ]]; then
  DOWNLOAD_URL="${MODEL_URLS[${MODEL_KEY}]}"
  FILENAME="${MODEL_FILENAMES[${MODEL_KEY}]}"
else
  # Direct URL provided
  DOWNLOAD_URL="${MODEL_KEY}"
  FILENAME="${2:-$(basename "${DOWNLOAD_URL}")}"
fi

TARGET_PATH="${MODELS_DIR}/${FILENAME}"

if [ -f "${TARGET_PATH}" ]; then
  echo "Model already exists at: ${TARGET_PATH}"
  read -p "Overwrite existing model? [y/N] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Download cancelled."
    exit 0
  fi
fi

echo "==> Downloading ${FILENAME}"
echo "    URL: ${DOWNLOAD_URL}"
echo "    Destination: ${TARGET_PATH}"

curl -L -C - --progress-bar -o "${TARGET_PATH}" "${DOWNLOAD_URL}"

echo "==> Download complete: ${TARGET_PATH}"
