#!/bin/bash
# Quick two-step: plan with Claude, implement with local Gemma 4
TASK="$1"
[ -z "$TASK" ] && TASK="Build a simple HTTP server in Dart"
WORKSPACE=~/Development/llm-coding-workflow/workspace
MODEL=~/Development/llm-coding-workflow/models/gemma-4-12b-it-qat-q4_0.gguf

echo "=== PHASE 1: Planning (Claude Sonnet) ==="
claude -p \
  "You are a senior architect. Plan: '$TASK'. Output a structured plan with file changes, key decisions, and testing strategy. Be concise." \
  --model sonnet --output-format text --max-turns 5 --max-budget-usd 1.0

echo ""
echo "=== PHASE 2: Implementation (Local Gemma 4) ==="
mkdir -p "$WORKSPACE"
llama-cli -m "$MODEL" \
  --n-gpu-layers 99 --threads 8 --temp 0.3 --top-p 0.9 --repeat-pen 1.1 \
  --n-predict 2048
