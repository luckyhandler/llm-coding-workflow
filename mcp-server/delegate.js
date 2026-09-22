/**
 * delegate_task: run a local coding agent (OpenCode driving the local
 * llama-server) inside a git repository and return a compact summary instead of
 * code. The calling agent spends a short brief plus a few hundred tokens of
 * summary, instead of reading files, writing edits and reading test output itself.
 */

import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);

const MAX_NOTES_CHARS = 1500;
const MAX_LISTED_FILES = 30;
const CHECK_TIMEOUT_MS = 10 * 60_000;
const KILL_GRACE_MS = 10_000;
// Small models can get stuck alternating between the same few tool calls, which
// OpenCode's own doom-loop check (identical consecutive calls) does not catch.
const LOOP_WINDOW = 12;
const LOOP_REPEATS = 4;
// The exact-input rule above misses the commonest form of flailing: hunting one
// symbol through directory after directory. Those calls differ only by path, so
// searches are also tracked by query alone, with a higher bar to avoid tripping
// on legitimate repeated lookups.
const SEARCH_LOOP_REPEATS = 6;
const SEARCH_TOOLS = new Set(["grep", "glob"]);
const SEARCH_COMMAND = /^(?:cd\s+\S+\s*&&\s*)?(?:grep|rg|find|ls|cat|head|sed)\b/;
const STEP_LIMIT_MARKER = "MAXIMUM STEPS REACHED";

/** Query of a read-only search with paths and flags stripped, else null. */
export function searchQuery(tool, input = {}) {
  let raw = null;
  if (SEARCH_TOOLS.has(tool)) raw = `${input.pattern ?? ""} ${input.include ?? ""}`;
  else if (tool === "bash" && SEARCH_COMMAND.test(String(input.command ?? "").trim())) raw = String(input.command);
  if (raw === null) return null;
  const query = raw
    .split(/\s+/)
    .filter((token) => token && !token.startsWith("-") && !token.includes("/"))
    .join(" ")
    .trim();
  return query ? `${tool}~${query}` : null;
}

// Agents run in their own process groups (see delegateTask); stop them if this server goes away.
const activeGroups = new Set();
const stopActiveGroups = () => {
  for (const pid of activeGroups) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
};
process.once("exit", stopActiveGroups);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => {
    stopActiveGroups();
    process.exit(128 + { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 }[signal]);
  });
}

const git = async (cwd, ...args) => (await execFileAsync("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 })).stdout;

export function buildAgentMessage({ task, check }) {
  const rules = [
    "You are a local implementation agent working in the repository in the current directory. Complete the task " +
      "below autonomously; nobody will answer questions.",
    "",
    "Code navigation — use the lsp tool for code identifiers (it is precise and cheaper than reading files):",
    "- Find where a symbol is defined: lsp workspaceSymbol with query=<name> (filePath = any source file of that " +
      "language, line=1, character=1).",
    "- Before renaming or changing a function, method, class or field: lsp findReferences at its definition " +
      "(1-based line/character of the identifier) to get every usage.",
    "- Get a file's outline without reading all of it: lsp documentSymbol. Check a signature or type: lsp hover.",
    "- To find which package or import provides a symbol you want to use: run lsp hover or lsp goToDefinition on an " +
      "existing usage of it in this repository. That gives you the declaring file and the import to copy. If the " +
      "symbol is already used elsewhere here, copy that file's import — do not go looking for the declaration.",
    "- Never search a dependency cache or vendor directory (~/.pub-cache, node_modules, site-packages, vendor/, " +
      ".dart_tool) for a definition. It is slow, it burns steps, and the answer is already in this repository.",
    "- Use grep/glob only for non-code text (strings, config keys, file names) or when lsp reports that no language " +
      "server is available.",
    "",
    "Rules:",
    "- Read only what you need. Follow the existing code style and any AGENTS.md / CLAUDE.md conventions.",
    "- Make the smallest change that fully solves the task. Do not modify unrelated files, do not commit, and do not " +
      "change git state.",
  ];
  if (check) {
    rules.push(`- Verify with \`${check}\`. If it fails, fix the cause and re-run until it passes or you are certain you cannot fix it.`);
  }
  rules.push(
    "- Finish with a brief summary (at most 10 lines): what changed and why, anything left undone, and assumptions you made.",
    "",
    "Task:",
    task
  );
  return rules.join("\n");
}

/**
 * Parse `git diff --numstat -z --no-renames` output into [{ path, added, deleted }]
 * (binary files report null counts). -z keeps unusual paths unquoted.
 */
export function parseNumstat(output) {
  return output
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const [added, deleted, ...rest] = line.split("\t");
      return {
        path: rest.join("\t"),
        added: added === "-" ? null : Number(added),
        deleted: deleted === "-" ? null : Number(deleted),
      };
    });
}

/** Fold OpenCode `--format json` events into run statistics and the agent's final message. */
export function createEventTracker() {
  const state = {
    sessionId: null,
    steps: 0,
    toolCalls: 0,
    tools: {},
    lastText: "",
    tokens: 0,
    errors: [],
    looping: false,
    hitStepLimit: false,
    lastStepReason: null,
  };
  const recentCalls = [];
  const recentSearches = [];
  return {
    state,
    /** Returns a short progress label for tool calls, otherwise null. */
    handle(event) {
      state.sessionId ??= event.sessionID ?? null;
      const part = event.part ?? {};
      switch (event.type) {
        case "step_start":
          state.steps += 1;
          return null;
        case "text":
          if (!part.text?.trim()) return null;
          // At the step limit OpenCode injects an instruction that the model sometimes just echoes back.
          if (part.text.includes(STEP_LIMIT_MARKER)) state.hitStepLimit = true;
          else state.lastText = part.text.trim();
          return null;
        case "step_finish":
          state.tokens = Math.max(state.tokens, part.tokens?.total ?? 0);
          state.lastStepReason = part.reason ?? null;
          return null;
        case "tool_use": {
          state.toolCalls += 1;
          state.tools[part.tool] = (state.tools[part.tool] ?? 0) + 1;
          const input = part.state?.input ?? {};
          const signature = `${part.tool}:${JSON.stringify(input)}`;
          recentCalls.push(signature);
          if (recentCalls.length > LOOP_WINDOW) recentCalls.shift();
          if (recentCalls.filter((call) => call === signature).length >= LOOP_REPEATS) state.looping = true;
          const query = searchQuery(part.tool, input);
          if (query) {
            recentSearches.push(query);
            if (recentSearches.length > LOOP_WINDOW) recentSearches.shift();
            if (recentSearches.filter((item) => item === query).length >= SEARCH_LOOP_REPEATS) state.looping = true;
          }
          const detail = input.command ?? input.filePath ?? input.pattern ?? input.operation ?? "";
          return `step ${state.steps}: ${part.tool} ${String(detail).split("/").slice(-2).join("/")}`.trim();
        }
        case "error":
          state.errors.push(event.error?.data?.message ?? event.error?.name ?? "unknown error");
          return null;
        default:
          return null;
      }
    },
  };
}

const formatDuration = (ms) => {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`;
};

export function formatSummary({ outcome, elapsedMs, tracker, changes, checkResult, snapshot, root, runDir }) {
  const { state } = tracker;
  const toolMix = Object.entries(state.tools)
    .sort((a, b) => b[1] - a[1])
    .map(([tool, count]) => `${tool}×${count}`)
    .join(" ");
  const lines = [
    `Local agent ${outcome} in ${formatDuration(elapsedMs)} (${state.steps} steps, ${state.toolCalls} tool calls` +
      `${toolMix ? `: ${toolMix}` : ""}; ${state.tokens} tokens of local context).`,
  ];

  if (checkResult) {
    lines.push(
      `Check \`${checkResult.command}\`: ${checkResult.passed ? "PASS" : `FAIL (exit ${checkResult.exitCode})`}` +
        (checkResult.passed ? ` — ${checkResult.tail}` : `\n${checkResult.tail}`)
    );
  }

  if (changes.length) {
    lines.push(`Changed files (vs snapshot ${snapshot.slice(0, 10)}):`);
    for (const change of changes.slice(0, MAX_LISTED_FILES)) {
      const counts = change.added === null ? "binary" : `+${change.added} -${change.deleted}`;
      lines.push(`  ${change.status} ${change.path}  ${counts}`);
    }
    if (changes.length > MAX_LISTED_FILES) lines.push(`  … and ${changes.length - MAX_LISTED_FILES} more`);
  } else {
    lines.push("No files changed.");
  }

  if (state.errors.length) lines.push(`Agent errors: ${[...new Set(state.errors)].join("; ")}`);

  const notes = state.lastText.length > MAX_NOTES_CHARS ? `${state.lastText.slice(0, MAX_NOTES_CHARS)}…` : state.lastText;
  if (notes) lines.push("Agent notes:", notes);

  const created = changes.filter((change) => change.status === "A").map((change) => change.path);
  const modified = changes.filter((change) => change.status !== "A").map((change) => change.path);
  const undo = [];
  if (modified.length) undo.push(`git restore --source=${snapshot} --worktree -- ${modified.join(" ")}`);
  if (created.length) undo.push(`rm ${created.join(" ")}`);
  if (undo.length) lines.push(`Undo (in ${root}): ${undo.join(" && ")}`);
  if (state.sessionId) lines.push(`Follow up in the same agent session: session_id=${state.sessionId}`);
  lines.push(`Run log: ${runDir}`);
  return lines.join("\n");
}

/**
 * Record the pre-run state without touching the user's working tree or refs:
 * `git stash create` writes a dangling commit of the current tracked changes.
 */
export async function snapshotRepo(root) {
  let snapshot = "";
  try {
    snapshot = (await git(root, "stash", "create")).trim();
  } catch {
    // e.g. during a merge; fall back to HEAD.
  }
  snapshot ||= (await git(root, "rev-parse", "HEAD")).trim();
  const untracked = new Set((await git(root, "ls-files", "--others", "--exclude-standard", "-z")).split("\0").filter(Boolean));
  return { snapshot, untracked };
}

/** Changes since the snapshot, with paths relative to the repository root. */
export async function collectChanges(root, { snapshot, untracked }) {
  const tracked = parseNumstat(await git(root, "diff", "--numstat", "-z", "--no-renames", snapshot)).map((entry) => ({
    ...entry,
    status: fs.existsSync(path.join(root, entry.path)) ? "M" : "D",
  }));
  const created = (await git(root, "ls-files", "--others", "--exclude-standard", "-z"))
    .split("\0")
    .filter((file) => file && !untracked.has(file))
    .map((file) => {
      let added = null;
      try {
        const content = fs.readFileSync(path.join(root, file), "utf-8");
        added = content.includes("\0") ? null : content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
      } catch {
        // Unreadable files are listed without counts.
      }
      return { path: file, added, deleted: 0, status: "A" };
    });
  return [...tracked, ...created];
}

function runCheck(command, cwd, signal) {
  return new Promise((resolve) => {
    const shell = process.env.SHELL || "/bin/bash";
    const child = spawn(shell, ["-lc", command], { cwd, signal, timeout: CHECK_TIMEOUT_MS });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (exitCode) => {
      const lines = output.trimEnd().split("\n");
      const passed = exitCode === 0;
      resolve({
        command,
        passed,
        exitCode,
        tail: passed ? lines.filter((line) => line.trim()).at(-1) ?? "" : lines.slice(-30).join("\n"),
      });
    });
    child.on("error", (err) => resolve({ command, passed: false, exitCode: null, tail: err.message }));
  });
}

/**
 * Run one delegation. `options` carries server-level settings:
 * { opencodeBin, configPath, stateDir, baseUrl, ctxSize, sampling(thinking), signal, onProgress }.
 */
export async function delegateTask(args, options) {
  const { task, cwd, check, thinking = false, reasoningEffort = "medium", maxMinutes = 30, sessionId } = args;
  if (!cwd || !path.isAbsolute(cwd) || !fs.statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error("`cwd` must be the absolute path of a directory inside a git repository.");
  }
  let root;
  try {
    await git(cwd, "rev-parse", "--verify", "HEAD");
    root = (await git(cwd, "rev-parse", "--show-toplevel")).trim();
  } catch {
    throw new Error(`${cwd} is not inside a git repository with at least one commit; delegate_task needs git to track changes.`);
  }

  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`;
  const runDir = path.join(options.stateDir, "runs", runId);
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(path.join(options.stateDir, "config"), { recursive: true });
  fs.mkdirSync(path.join(options.stateDir, "data"), { recursive: true });

  const before = await snapshotRepo(root);
  const message = buildAgentMessage({ task, check });
  fs.writeFileSync(path.join(runDir, "message.md"), message);

  const runtimeConfig = {
    provider: {
      local: {
        models: {
          // Must stay "default_model": mlx_lm.server treats every other model id
          // as a repo/path to load on demand, so any other name makes it try to
          // fetch that repo. llama-server ignores the field.
          default_model: {
            // Thinking can take >16K tokens in a single step on hard problems.
            limit: { context: options.ctxSize, output: thinking ? 32768 : 16384 },
            // Passed through into the request body by @ai-sdk/openai-compatible.
            options: {
              ...options.sampling(thinking),
              chat_template_kwargs: thinking
                ? { enable_thinking: true, reasoning_effort: reasoningEffort }
                : { enable_thinking: false },
            },
          },
        },
      },
    },
  };

  const cliArgs = ["run", "--format", "json", "--auto", "--title", `delegate: ${task.slice(0, 60)}`, "-m", "local/default_model"];
  if (sessionId) cliArgs.push("--session", sessionId);
  cliArgs.push(message);

  const tracker = createEventTracker();
  const events = fs.createWriteStream(path.join(runDir, "events.jsonl"));
  const stderr = fs.createWriteStream(path.join(runDir, "stderr.log"));
  const startedAt = Date.now();

  const outcome = await new Promise((resolve) => {
    const child = spawn(options.opencodeBin, cliArgs, {
      cwd,
      // Own process group, so stopping the agent also stops its language servers and running commands.
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        // opencode may resolve the working directory from PWD; keep it in
        // sync with the real spawn cwd so the agent works in `cwd`, not in
        // whatever directory the MCP server was started from.
        PWD: cwd,
        // Isolate from the user's global OpenCode config (MCP servers, plugins, cloud providers).
        XDG_CONFIG_HOME: path.join(options.stateDir, "config"),
        XDG_DATA_HOME: path.join(options.stateDir, "data"),
        OPENCODE_CONFIG: options.configPath,
        OPENCODE_CONFIG_CONTENT: JSON.stringify(runtimeConfig),
        OPENCODE_EXPERIMENTAL_LSP_TOOL: "true",
        LOCAL_AGENT_BASE_URL: options.baseUrl,
      },
    });

    if (child.pid) activeGroups.add(child.pid);
    let timedOut = false;
    let settled = false;
    const signalGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        child.kill(signal);
      }
    };
    const stop = () => {
      signalGroup("SIGTERM");
      setTimeout(() => signalGroup("SIGKILL"), KILL_GRACE_MS).unref();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, maxMinutes * 60_000);
    const onAbort = () => stop();
    options.signal?.addEventListener("abort", onAbort, { once: true });

    let buffer = "";
    let stoppedForLoop = false;
    child.stdout.on("data", (chunk) => {
      events.write(chunk);
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          const label = tracker.handle(JSON.parse(line));
          if (label) options.onProgress?.(label, tracker.state.toolCalls);
          if (tracker.state.looping && !stoppedForLoop) {
            stoppedForLoop = true;
            stop();
          }
        } catch {
          // Non-JSON output lines are kept in the run log only.
        }
      }
    });
    child.stderr.pipe(stderr);

    const finish = (result) => {
      if (settled) return;
      settled = true;
      activeGroups.delete(child.pid);
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      events.end();
      resolve(result);
    };
    child.on("error", (err) => finish(`failed to start OpenCode (${err.message})`));
    child.on("close", (code) => {
      if (options.signal?.aborted) finish("cancelled");
      else if (stoppedForLoop) finish("stopped: it kept repeating the same tool calls");
      else if (timedOut) finish(`stopped at the ${maxMinutes}-minute budget`);
      else if (tracker.state.hitStepLimit) finish("stopped at the step limit");
      else if (tracker.state.lastStepReason === "length") finish("stopped: the model used up its output-token limit in one step");
      else if (code === 0 && !tracker.state.errors.length) finish("completed");
      else finish(`failed (exit ${code})`);
    });
  });

  const changes = await collectChanges(root, before);
  const checkResult = check && !options.signal?.aborted ? await runCheck(check, cwd, options.signal) : null;

  const summary = formatSummary({
    outcome,
    elapsedMs: Date.now() - startedAt,
    tracker,
    changes,
    checkResult,
    snapshot: before.snapshot,
    root,
    runDir,
  });
  fs.writeFileSync(path.join(runDir, "summary.txt"), summary);
  return { summary, outcome, changes, checkResult, sessionId: tracker.state.sessionId };
}
