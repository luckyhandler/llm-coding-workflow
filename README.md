# LLM Coding Workflow

Two-model orchestration: Claude Code (Claude Pro/Opus) for planning + local Gemma 4 via llama.cpp for implementation.

## Architecture

```
Claude Code (planning)  →  Gemma 4 12B QAT Q4_0 (implementation)  →  Claude Code (review)
```

## Prerequisites

- **macOS M1 Pro** (or Apple Silicon with 16GB+ RAM)
- **llama.cpp** (`brew install llama.cpp`)
- **Claude Code** (`npm install -g @anthropic-ai/claude-code`)
- **6.5 GB free disk** for the Gemma 4 12B model

## Setup

1. Grab the model from HuggingFace:
   ```bash
   # Already downloaded in models/gemma-4-12b-it-qat-q4_0.gguf
   ```

2. Install tools:
   ```bash
   brew install llama.cpp
   npm install -g @anthropic-ai/claude-code
   claude auth login
   ```

## Usage

```bash
# Run the full workflow (plan → implement → review):
./workflows/run-coding-session.sh "Build a JWT auth module"

# Just plan:
claude -p "Plan the architecture for ..." --model sonnet

# Just implement locally:
llama-cli -m models/gemma-4-12b-it-qat-q4_0.gguf -p "Write the code for ..."

# Start local server:
llama-server -m models/gemma-4-12b-it-qat-q4_0.gguf --n-gpu-layers 99 --port 8080
```

## Key Details

- **Model:** [google/gemma-4-12b-it-qat-q4_0-gguf](https://huggingface.co/google/gemma-4-12B-it-qat-q4_0-gguf) — official Google QAT quant, not community-tuned
- **VRAM Usage:** ~6.5GB → fits on M1 Pro 32GB, 100% Metal GPU offload
- **Claude Code Model:** `sonnet` (fast) / `opus` (complex tasks)
- **Token Budget:** Claude ~200K context. Local model 256K context.

## Project Structure

```
models/           # Downloaded GGUF model files
workflows/        # Orchestration scripts
workspace/        # Working directory for implementations
```
