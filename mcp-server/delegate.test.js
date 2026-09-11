import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildAgentMessage,
  collectChanges,
  createEventTracker,
  formatSummary,
  parseNumstat,
  snapshotRepo,
} from "./delegate.js";

test("buildAgentMessage includes the task and, when given, the check command", () => {
  const withCheck = buildAgentMessage({ task: "Add a flag", check: "npm test" });
  assert.match(withCheck, /Verify with `npm test`/);
  assert.match(withCheck, /Task:\nAdd a flag$/);
  assert.doesNotMatch(buildAgentMessage({ task: "Add a flag" }), /Verify with/);
});

test("parseNumstat handles text, binary, and tab-containing paths", () => {
  const output = ["3\t1\tsrc/a.py", "-\t-\timg.png", "1\t0\tweird\tname.txt", ""].join("\0");
  assert.deepEqual(parseNumstat(output), [
    { path: "src/a.py", added: 3, deleted: 1 },
    { path: "img.png", added: null, deleted: null },
    { path: "weird\tname.txt", added: 1, deleted: 0 },
  ]);
});

test("event tracker counts steps and tools and keeps the last text and max context", () => {
  const tracker = createEventTracker();
  const events = [
    { type: "step_start", sessionID: "ses_1", part: {} },
    { type: "tool_use", sessionID: "ses_1", part: { tool: "read", state: { input: { filePath: "/repo/src/a.py" } } } },
    { type: "step_finish", sessionID: "ses_1", part: { tokens: { total: 900 } } },
    { type: "step_start", sessionID: "ses_1", part: {} },
    { type: "tool_use", sessionID: "ses_1", part: { tool: "bash", state: { input: { command: "pytest -q" } } } },
    { type: "text", sessionID: "ses_1", part: { text: "  Done: tests pass.  " } },
    { type: "step_finish", sessionID: "ses_1", part: { tokens: { total: 1200 } } },
  ];
  const labels = events.map((event) => tracker.handle(event)).filter(Boolean);
  assert.deepEqual(labels, ["step 1: read src/a.py", "step 2: bash pytest -q"]);
  assert.equal(tracker.state.sessionId, "ses_1");
  assert.equal(tracker.state.steps, 2);
  assert.deepEqual(tracker.state.tools, { read: 1, bash: 1 });
  assert.equal(tracker.state.lastText, "Done: tests pass.");
  assert.equal(tracker.state.tokens, 1200);
});

test("event tracker flags alternating repeated tool calls as a loop", () => {
  const tracker = createEventTracker();
  const call = (command) => ({ type: "tool_use", part: { tool: "bash", state: { input: { command } } } });
  for (let i = 0; i < 3; i++) {
    tracker.handle(call("python -c 'check(a/b)'"));
    tracker.handle(call("python -c 'check(a//b)'"));
  }
  assert.equal(tracker.state.looping, false);
  tracker.handle(call("python -c 'check(a/b)'"));
  assert.equal(tracker.state.looping, true);
});

test("event tracker ignores the echoed step-limit instruction", () => {
  const tracker = createEventTracker();
  tracker.handle({ type: "text", part: { text: "Real summary." } });
  tracker.handle({ type: "text", part: { text: "CRITICAL - MAXIMUM STEPS REACHED\n\nTools are disabled" } });
  assert.equal(tracker.state.hitStepLimit, true);
  assert.equal(tracker.state.lastText, "Real summary.");
});

test("event tracker remembers why the last step ended", () => {
  const tracker = createEventTracker();
  tracker.handle({ type: "step_finish", part: { reason: "tool-calls", tokens: { total: 10 } } });
  tracker.handle({ type: "step_finish", part: { reason: "length", tokens: { total: 20 } } });
  assert.equal(tracker.state.lastStepReason, "length");
});

test("event tracker records API errors", () => {
  const tracker = createEventTracker();
  tracker.handle({ type: "error", error: { name: "APIError", data: { message: "Cannot connect" } } });
  assert.deepEqual(tracker.state.errors, ["Cannot connect"]);
});

test("formatSummary reports check, changes, undo, and session", () => {
  const tracker = createEventTracker();
  tracker.handle({ type: "step_start", sessionID: "ses_9", part: {} });
  tracker.handle({ type: "text", part: { text: "Implemented it." } });
  const summary = formatSummary({
    outcome: "completed",
    elapsedMs: 83_000,
    tracker,
    changes: [
      { path: "src/a.py", added: 5, deleted: 2, status: "M" },
      { path: "src/new.py", added: 10, deleted: 0, status: "A" },
    ],
    checkResult: { command: "pytest", passed: false, exitCode: 1, tail: "1 failed" },
    snapshot: "abc123def4567",
    root: "/repo",
    runDir: "/tmp/run",
  });
  assert.match(summary, /^Local agent completed in 1m23s \(1 steps/);
  assert.match(summary, /Check `pytest`: FAIL \(exit 1\)\n1 failed/);
  assert.match(summary, / {2}M src\/a\.py {2}\+5 -2/);
  assert.match(summary, /Undo \(in \/repo\): git restore --source=abc123def4567 --worktree -- src\/a\.py && rm src\/new\.py/);
  assert.match(summary, /session_id=ses_9/);
  assert.match(summary, /Agent notes:\nImplemented it\./);
});

test("formatSummary says so when nothing changed", () => {
  const summary = formatSummary({
    outcome: "completed",
    elapsedMs: 5_000,
    tracker: createEventTracker(),
    changes: [],
    checkResult: null,
    snapshot: "abc",
    root: "/repo",
    runDir: "/tmp/run",
  });
  assert.match(summary, /No files changed\./);
  assert.doesNotMatch(summary, /Undo/);
});

test("snapshot + collectChanges report only changes made after the snapshot", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-test-"));
  const git = (...args) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: repo });
  try {
    git("init", "-q");
    fs.writeFileSync(path.join(repo, "kept.txt"), "one\n");
    fs.writeFileSync(path.join(repo, "edited.txt"), "a\nb\n");
    fs.writeFileSync(path.join(repo, "deleted.txt"), "x\n");
    git("add", "-A");
    git("commit", "-qm", "init");

    // Pre-existing user changes must not be attributed to the agent.
    fs.writeFileSync(path.join(repo, "kept.txt"), "one\nuser edit\n");
    fs.writeFileSync(path.join(repo, "user-untracked.txt"), "mine\n");

    const before = await snapshotRepo(repo);

    fs.writeFileSync(path.join(repo, "edited.txt"), "a\nB\nc\n");
    fs.rmSync(path.join(repo, "deleted.txt"));
    fs.mkdirSync(path.join(repo, "src"));
    fs.writeFileSync(path.join(repo, "src", "new.py"), "print(1)\nprint(2)\n");

    const changes = await collectChanges(repo, before);
    const byPath = Object.fromEntries(changes.map((change) => [change.path, change]));
    assert.deepEqual(Object.keys(byPath).sort(), ["deleted.txt", "edited.txt", "src/new.py"]);
    assert.deepEqual(byPath["edited.txt"], { path: "edited.txt", added: 2, deleted: 1, status: "M" });
    assert.equal(byPath["deleted.txt"].status, "D");
    assert.deepEqual(byPath["src/new.py"], { path: "src/new.py", added: 2, deleted: 0, status: "A" });

    // The snapshot restores the pre-delegation state, including the user's own edit.
    git("restore", `--source=${before.snapshot}`, "--worktree", "--", "edited.txt", "deleted.txt");
    assert.equal(fs.readFileSync(path.join(repo, "edited.txt"), "utf-8"), "a\nb\n");
    assert.equal(fs.readFileSync(path.join(repo, "kept.txt"), "utf-8"), "one\nuser edit\n");
    assert.ok(fs.existsSync(path.join(repo, "deleted.txt")));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
