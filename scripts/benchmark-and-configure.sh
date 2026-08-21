#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MODELS_DIR="${REPO_ROOT}/models"
ENV_FILE="${REPO_ROOT}/.env"

APPLY=false
DRY_RUN=false
RUN_BENCHMARK=false
AUTO_DOWNLOAD=false
MOCK_RAM=""

usage() {
  cat <<EOF
Usage: $0 [options]

Options:
  --apply          Automatically apply recommended configuration to .env
  --dry-run        Display detected hardware and recommendations without writing files
  --benchmark      Run a micro-benchmark on existing installed models
  --download       Automatically download the recommended model if missing
  --mock-ram <GB>  Simulate a specific RAM amount (e.g., 8, 16, 24, 32, 64) for testing
  --help           Show this help message

Examples:
  $0 --apply
  $0 --dry-run
  $0 --apply --download
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      APPLY=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --benchmark|--run-benchmark)
      RUN_BENCHMARK=true
      shift
      ;;
    --download|--auto-download)
      AUTO_DOWNLOAD=true
      shift
      ;;
    --mock-ram)
      MOCK_RAM="$2"
      shift 2
      ;;
    --help|-h)
      usage
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      ;;
  esac
done

echo "============================================================"
echo "    Mac LLM Hardware Profiler & Gemma Configurator"
echo "============================================================"

# Detect OS
OS_NAME="$(uname -s)"
if [ "${OS_NAME}" != "Darwin" ]; then
  echo "Warning: Non-macOS system detected (${OS_NAME}). Tuning defaults for generic POSIX."
fi

# Detect CPU & Architecture
CHIP_NAME="$(sysctl -n machdep.cpu.brand_string 2>/dev/null || uname -m)"
TOTAL_CORES="$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"
P_CORES="$(sysctl -n hw.perflevel0.logicalcpu 2>/dev/null || echo "${TOTAL_CORES}")"
E_CORES="$(sysctl -n hw.perflevel1.logicalcpu 2>/dev/null || echo 0)"

# Detect RAM
if [ -n "${MOCK_RAM}" ]; then
  RAM_GB="${MOCK_RAM}"
  echo "[MOCK MODE] Simulating Unified Memory: ${RAM_GB} GB"
else
  RAM_BYTES="$(sysctl -n hw.memsize 2>/dev/null || echo 17179869184)"
  RAM_GB="$(( RAM_BYTES / 1024 / 1024 / 1024 ))"
fi

# Detect GPU Cores
GPU_CORES="$(system_profiler SPDisplaysDataType 2>/dev/null | awk -F': ' '/Total Number of Cores/ {print $2}' | head -n 1 || echo "Integrated")"
if [ -z "${GPU_CORES}" ]; then
  GPU_CORES="Apple Silicon GPU"
fi

# Detect Available Disk Space in repo
AVAIL_DISK_GB="$(df -g "${REPO_ROOT}" | awk 'NR==2 {print $4}' 2>/dev/null || echo "Unknown")"

echo "Detected Hardware:"
echo "  - Chip:           ${CHIP_NAME}"
echo "  - Unified RAM:    ${RAM_GB} GB"
echo "  - CPU Topology:   ${TOTAL_CORES} cores (${P_CORES} Performance, ${E_CORES} Efficiency)"
echo "  - GPU:            ${GPU_CORES} cores (Metal accelerated)"
echo "  - Disk Available: ${AVAIL_DISK_GB} GB"
echo "------------------------------------------------------------"

# Determine Optimal Tier & Recommendations
# Model selection rule based on Unified Memory
if [ "${RAM_GB}" -lt 12 ]; then
  # 8GB Tier
  TIER="Entry / Ultralight (<= 8GB Unified RAM)"
  REC_MODEL_NAME="gemma-2-2b-it-Q4_K_M"
  REC_MODEL_FILE="gemma-2-2b-it-Q4_K_M.gguf"
  REC_MODEL_KEY="gemma-2b-q4_k_m"
  REC_CTX_SIZE=16384
  REC_BATCH_SIZE=1024
  REC_UBATCH_SIZE=256
  REC_MAX_TOKENS=4096
elif [ "${RAM_GB}" -lt 28 ]; then
  # 16GB - 24GB Tier
  TIER="Mid-Range (16GB - 24GB Unified RAM)"
  REC_MODEL_NAME="gemma-4-12b-it-qat-q4_0"
  REC_MODEL_FILE="gemma-4-12b-it-qat-q4_0.gguf"
  REC_MODEL_KEY="gemma-4-12b-qat-q4_0"
  REC_CTX_SIZE=32768
  REC_BATCH_SIZE=2048
  REC_UBATCH_SIZE=512
  REC_MAX_TOKENS=8192
elif [ "${RAM_GB}" -lt 56 ]; then
  # 32GB - 48GB Tier (e.g. M1/M2/M3/M4 Pro/Max 32-48GB)
  TIER="High Performance (32GB - 48GB Unified RAM)"
  REC_MODEL_NAME="gemma-4-12b-it-qat-q4_0"
  REC_MODEL_FILE="gemma-4-12b-it-qat-q4_0.gguf"
  REC_MODEL_KEY="gemma-4-12b-qat-q4_0"
  REC_CTX_SIZE=65536
  REC_BATCH_SIZE=2048
  REC_UBATCH_SIZE=512
  REC_MAX_TOKENS=8192
else
  # 64GB+ Tier
  TIER="Workstation / Max Memory (>= 64GB Unified RAM)"
  REC_MODEL_NAME="gemma-2-27b-it-Q8_0"
  REC_MODEL_FILE="gemma-2-27b-it-Q8_0.gguf"
  REC_MODEL_KEY="gemma-27b-q8_0"
  REC_CTX_SIZE=65536
  REC_BATCH_SIZE=4096
  REC_UBATCH_SIZE=1024
  REC_MAX_TOKENS=16384
fi

# Threads: Set to Performance Core count to prevent efficiency core scheduling jitter
REC_THREADS="${P_CORES}"
REC_GPU_LAYERS=99
REC_FLASH_ATTN="on"
REC_HOST="127.0.0.1"
REC_PORT="8090"
REC_MODEL_PATH="models/${REC_MODEL_FILE}"

echo "Recommended Profile: ${TIER}"
echo "  - Recommended Model:     ${REC_MODEL_NAME} (${REC_MODEL_PATH})"
echo "  - Context Size (ctx):     ${REC_CTX_SIZE} tokens"
echo "  - Worker Threads:         ${REC_THREADS} (tuned to Performance cores)"
echo "  - GPU Metal Layers:       ${REC_GPU_LAYERS} (full offload)"
echo "  - Flash Attention:        ${REC_FLASH_ATTN}"
echo "  - Batch / UBatch:         ${REC_BATCH_SIZE} / ${REC_UBATCH_SIZE}"
echo "  - Output Max Tokens:      ${REC_MAX_TOKENS}"
echo "============================================================"

# Check if model exists locally
TARGET_MODEL_FULL_PATH="${REPO_ROOT}/${REC_MODEL_PATH}"
MODEL_EXISTS=false
if [ -f "${TARGET_MODEL_FULL_PATH}" ]; then
  MODEL_EXISTS=true
  echo "Model Status: PRESENT locally at ${REC_MODEL_PATH}"
else
  echo "Model Status: NOT FOUND at ${REC_MODEL_PATH}"
fi

# Optional Micro-Benchmark
if [ "${RUN_BENCHMARK}" = true ]; then
  echo ""
  echo "--- Running Micro-Benchmark ---"
  if [ "${MODEL_EXISTS}" = true ] && command -v llama-bench >/dev/null 2>&1; then
    echo "Running llama-bench with ${REC_THREADS} threads on ${TARGET_MODEL_FULL_PATH}..."
    llama-bench \
      -m "${TARGET_MODEL_FULL_PATH}" \
      -r 1 \
      -n 64 \
      -p 128,512 \
      -t "${REC_THREADS}" \
      -ngl "${REC_GPU_LAYERS}" || true
  else
    echo "Skipping live benchmark (llama-bench not installed or model file missing)."
  fi
  echo "-------------------------------"
fi

# Handle Download if requested or missing
if [ "${MODEL_EXISTS}" = false ] && [ "${DRY_RUN}" = false ]; then
  if [ "${AUTO_DOWNLOAD}" = true ]; then
    echo ""
    echo "Auto-download enabled. Fetching recommended model..."
    bash "${SCRIPT_DIR}/download-model.sh" "${REC_MODEL_KEY}"
    MODEL_EXISTS=true
  else
    echo ""
    echo "Note: To download this recommended model, run:"
    echo "  scripts/download-model.sh ${REC_MODEL_KEY}"
  fi
fi

# Apply configuration
if [ "${DRY_RUN}" = true ]; then
  echo ""
  echo "[Dry Run] No files modified."
  exit 0
fi

SHOULD_WRITE=false
if [ "${APPLY}" = true ]; then
  SHOULD_WRITE=true
else
  echo ""
  read -p "Apply these settings to ${ENV_FILE}? [Y/n] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    SHOULD_WRITE=true
  fi
fi

if [ "${SHOULD_WRITE}" = true ]; then
  cat > "${ENV_FILE}" <<EOF
# Local Gemma Model & Server Configuration
# Auto-generated by scripts/benchmark-and-configure.sh for ${CHIP_NAME} (${RAM_GB}GB RAM)
# Generated at: $(date)

# Model Settings
LOCAL_GEMMA_MODEL_NAME=${REC_MODEL_NAME}
LOCAL_GEMMA_MODEL_PATH=${REC_MODEL_PATH}

# Hardware & Engine Tuning
LOCAL_GEMMA_GPU_LAYERS=${REC_GPU_LAYERS}
LOCAL_GEMMA_CTX_SIZE=${REC_CTX_SIZE}
LOCAL_GEMMA_THREADS=${REC_THREADS}
LOCAL_GEMMA_FLASH_ATTN=${REC_FLASH_ATTN}
LOCAL_GEMMA_BATCH_SIZE=${REC_BATCH_SIZE}
LOCAL_GEMMA_UBATCH_SIZE=${REC_UBATCH_SIZE}

# Network & Server
LOCAL_GEMMA_HOST=${REC_HOST}
LOCAL_GEMMA_PORT=${REC_PORT}

# Inference Headroom
LOCAL_GEMMA_MAX_TOKENS=${REC_MAX_TOKENS}
EOF

  echo "Successfully applied configuration to ${ENV_FILE}"
  echo "You can now run 'scripts/ensure-llama-server.sh' or start your MCP client."
fi
