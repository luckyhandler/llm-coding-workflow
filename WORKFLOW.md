# LLM Coding Workflow

Two-model orchestration: Claude Code (Claude Pro/Opus) for planning, local Gemma 4 12B via llama.cpp for implementation.

## Architecture

```
┌──────────────────┐    ┌─────────────────────┐    ┌──────────────────┐
│  Claude Code     │    │  Gemma 4 12B QAT     │    │  Claude Code     │
│  (planning)      │───▶│  (implementation)   │───▶│  (review)        │
│  Sonnet/Opus     │    │  llama.cpp + Metal   │    │  Sonnet/Opus     │
└──────────────────┘    └─────────────────────┘    └──────────────────┘
```

## Setup

### 1. Download the model
```bash
# Already in models/ directory
ls -lh models/gemma-4-12b-it-qat-q4_0.gguf
```

### 2. Install tools
```bash
brew install llama.cpp
npm install -g @anthropic-ai/claude-code
claude auth login
```

### 3. Run the workflow
```bash
./workflows/run-coding-session.sh "Build a JWT auth module in Dart"
```

## Model Details

- **Model:** `google/gemma-4-12b-it-qat-q4_0-gguf`
- **Source:** Official Google Gemma 4 (QAT quantized to Q4_0)
- **Size:** 6.5 GB
- **Hardware:** M1 Pro + 32GB RAM (all layers offloaded to GPU via Metal)
- **Context:** 256K tokens
- **License:** Apache 2.0

## Commands

```bash
# Quick local inference
llama-cli -m models/gemma-4-12b-it-qat-q4_0.gguf -p "Explain BLoC pattern" --n-gpu-layers 99

# Start server for API use
llama-server -m models/gemma-4-12b-it-qat-q4_0.gguf --n-gpu-layers 99 --port 8080

# Claude Code print mode
claude -p "Plan the architecture" --model sonnet --max-turns 5
```

## Claude Code Settings

See `.claude/settings.json` for tool permissions (git, npm, dart, flutter, llama commands allowed).
