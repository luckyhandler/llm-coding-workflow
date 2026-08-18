#!/bin/bash
# Two-Model Coding Workflow
# Phase 1: Plan with Claude Code (Claude Pro/Opus — first-class reasoning)
# Phase 2: Implement with local Gemma 4 (llama.cpp server)
# Phase 3: Review back with Claude Code

set -euo pipefail

WORKSPACE="${1:-$HOME/Development/llm-coding-workflow/workspace}"
MODEL_PATH="${MODEL_PATH:-$HOME/Development/llm-coding-workflow/models/gemma-4-12b-it-qat-q4_0.gguf}"
LLAMA_SERVER_PORT="${LLAMA_SERVER_PORT:-8080}"
CLAUDE_MODEL="${CLAUDE_MODEL:-sonnet}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $1"; }
success() { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} ✓ $1"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)]${NC} ⚠ $1"; }

# Check prerequisites
check_prereqs() {
    local missing=()
    command -v claude >/dev/null 2>&1 || missing+=("claude-code")
    command -v llama-server >/dev/null 2>&1 || missing+=("llama.cpp")
    [ ${#missing[@]} -eq 0 ] || {
        echo "Missing: ${missing[*]}"
        exit 1
    }
    [ -f "$MODEL_PATH" ] || {
        echo "Model not found at: $MODEL_PATH"
        exit 1
    }
}

# Phase 1: Claude Code creates the implementation plan
phase1_plan() {
    local task="$1"
    log "PHASE 1: Planning with Claude Code ($CLAUDE_MODEL)"

    local plan_file="$WORKSPACE/PLAN.md"
    claude -p \
        "You are a senior software architect. Given this task: '$task', produce a detailed implementation plan with:
1. Problem decomposition into 3-5 concrete sub-tasks
2. File structure changes needed (new files, edits to existing)
3. Key technical decisions and trade-offs
4. Testing strategy for each sub-task
5. Potential pitfalls/risks

Output a clean markdown plan. Do not implement anything yet." \
        --model "$CLAUDE_MODEL" \
        --output-format json \
        --max-turns 8 \
        --max-budget-usd 2.00 \
        --workdir "$WORKSPACE" \
        2>&1 | tee "$WORKSPACE/.claude-plan-output.json" > /dev/null | \
    python3 -c "
import json, sys
data = json.loads(open('$WORKSPACE/.claude-plan-output.json').read())
plan = data.get('result', 'No plan generated')
with open('$plan_file', 'w') as f:
    f.write(plan)
print(plan)
"

    success "Plan saved to $plan_file"
    echo ""
    cat "$plan_file"
}

# Phase 2: Start local llama.cpp server and implement
phase2_implement() {
    local plan_file="$WORKSPACE/PLAN.md"
    log "PHASE 2: Implementing with local Gemma 4"

    # Start llama.cpp server in background with Metal offload
    log "Starting llama.cpp server (Metal GPU offload)..."
    llama-server \
        --model "$MODEL_PATH" \
        --host 127.0.0.1 \
        --port "$LLAMA_SERVER_PORT" \
        --threads 8 \
        --n-gpu-layers 99 \
        --flash-attn \
        > "$WORKSPACE/.llama-server.log" 2>&1 &

    local LLAMA_PID=$!
    echo "  Server PID: $LLAMA_PID"

    # Wait for server to be ready
    log "Waiting for server to initialize..."
    local max_wait=120
    local waited=0
    while ! curl -s "http://127.0.0.1:$LLAMA_SERVER_PORT/health" > /dev/null 2>&1; do
        sleep 2
        waited=$((waited + 2))
        if [ $waited -ge $max_wait ]; then
            warn "Server didn't fully respond, but may still be ready..."
            break
        fi
        echo -n "."
    done
    echo ""

    # Give it extra time to fully load the model
    log "Loading model (this takes 10-30s on M1 Pro)..."
    sleep 15

    if curl -s "http://127.0.0.1:$LLAMA_SERVER_PORT/health" | grep -q '"pass"' 2>/dev/null; then
        success "llama.cpp server is running on port $LLAMA_SERVER_PORT"
    else
        warn "Server health check inconclusive, proceeding anyway..."
    fi

    # Read the plan and generate implementation commands for Gemma
    local plan_text
    plan_text=$(cat "$plan_file")

    # Build the prompt for the local model
    local prompt="You are a senior software engineer implementing a plan. The workspace is at $WORKSPACE.

Implementation Plan:
$plan_text

IMPORTANT: For each code change you need to make:
1. State what you would do
2. Write the complete file content
3. Use bash commands to create/write files

Start with the highest priority sub-task. You have access to bash for file operations and can use tools like cat, mkdir, etc.

Focus on correctness and clean code. Do NOT write tests — just the implementation. Be concise but thorough."

    # Execute implementation via the llama.cpp server
    log "Sending implementation task to local Gemma 4..."

    llama-cli \
        --model "$MODEL_PATH" \
        --threads 8 \
        --n-gpu-layers 99 \
        --temp 0.3 \
        --top-p 0.9 \
        --repeat-pen 1.1 \
        --cache "$WORKSPACE/.llama-cache" \
        -p "$prompt" \
        --n-predict -1 \
        2>&1 | tee "$WORKSPACE/.gemma-output.log"

    # Clean up server
    kill $LLAMA_PID 2>/dev/null || true
    wait $LLAMA_PID 2>/dev/null || true

    success "Implementation complete"
}

# Phase 3: Review with Claude Code
phase3_review() {
    log "PHASE 3: Reviewing with Claude Code ($CLAUDE_MODEL)"

    claude -p \
        "You are a senior code reviewer. Review all changes in $WORKSPACE against the plan in $WORKSPACE/PLAN.md.
Check for:
1. Completeness — all sub-tasks addressed?
2. Code quality — clean, well-structured, idiomatic
3. Bugs or edge cases missed
4. Testing gaps

Output a structured review with specific feedback." \
        --model "$CLAUDE_MODEL" \
        --output-format text \
        --max-turns 5 \
        --max-budget-usd 1.00 \
        --workdir "$WORKSPACE" \
        2>&1
}

# Main
main() {
    local task="$1"
    [ -z "$task" ] && { echo "Usage: $0 '<task description>'"; exit 1; }

    log "=== Two-Model Coding Workflow ==="
    log "Task: $task"

    mkdir -p "$WORKSPACE"

    check_prereqs

    echo ""
    echo "──────────────────────────────────"
    phase1_plan "$task"
    echo "──────────────────────────────────"
    echo ""

    # Pause between phases for user review
    warn "Phase 1 complete. Review the plan above."
    warn "Press ENTER to continue to implementation..."
    read -r

    echo ""
    echo "──────────────────────────────────"
    phase2_implement "$task"
    echo "──────────────────────────────────"
    echo ""

    warn "Phase 2 complete. Review the implementation output."
    warn "Press ENTER to continue to review..."
    read -r

    echo ""
    echo "──────────────────────────────────"
    phase3_review
    echo "──────────────────────────────────"
    echo ""

    success "Workflow complete!"
}

main "$@"
