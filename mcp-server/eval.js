#!/usr/bin/env node
/**
 * Runs the coding tasks under evals/tasks/ against the local model through the
 * real delegate_task harness, so a model comparison reflects how the worker
 * actually performs (navigation, edits, and iterating on a check command) and
 * not just raw token speed.
 *
 * Usage:
 *   node mcp-server/eval.js [--base-url URL] [--ctx-size N] [--max-minutes N]
 *                           [--task NAME] [--label LABEL] [--out FILE]
 *
 * Each task directory holds `task.md`, a `check.sh`, and a `repo/` seed. The
 * seed is copied to a scratch git repository per run; `check.sh` is the pass
 * condition. Results are printed and written as JSON when --out is given.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { delegateTask } from "./delegate.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const TASKS_DIR = path.join(REPO_ROOT, "evals", "tasks");
const AGENT_CONFIG = path.join(REPO_ROOT, "agent-worker", "opencode.json");

function parseArgs(argv) {
  const args = { baseUrl: "http://127.0.0.1:8090/v1", ctxSize: 131072, maxMinutes: 20 };
  for (let i = 0; i < argv.length; i += 1) {
    const next = () => argv[++i];
    switch (argv[i]) {
      case "--base-url": args.baseUrl = next(); break;
      case "--ctx-size": args.ctxSize = Number(next()); break;
      case "--max-minutes": args.maxMinutes = Number(next()); break;
      case "--task": args.task = next(); break;
      case "--label": args.label = next(); break;
      case "--out": args.out = next(); break;
      default: throw new Error(`Unknown option: ${argv[i]}`);
    }
  }
  return args;
}

async function git(repo, ...args) {
  return (await execFileAsync("git", args, { cwd: repo })).stdout;
}

async function prepareRepo(taskDir, runDir) {
  const repo = path.join(runDir, "repo");
  fs.mkdirSync(repo, { recursive: true });
  fs.cpSync(path.join(taskDir, "repo"), repo, { recursive: true });
  // Keep byte-compile artifacts and virtualenvs out of the change report.
  fs.writeFileSync(path.join(repo, ".gitignore"), "__pycache__/\n*.pyc\n.venv/\n");
  await execFileAsync("git", ["init", "-q"], { cwd: repo });
  await execFileAsync("git", ["add", "-A"], { cwd: repo });
  await execFileAsync("git", ["-c", "user.email=eval@local", "-c", "user.name=eval", "commit", "-qm", "seed"], { cwd: repo });
  return repo;
}

/** Test files the agent must not touch; restoring them neutralises test tampering. */
async function seedTestFiles(repo) {
  const tracked = (await git(repo, "ls-files")).split("\n").filter(Boolean);
  return tracked.filter((f) => /(^|\/)(test_[^/]+|[^/]+_test)\.(py|js|ts|go|rb|rs)$/.test(f));
}

function runCheck(repo, command) {
  return new Promise((resolve) => {
    const shell = process.env.SHELL || "/bin/bash";
    const child = execFile(shell, ["-lc", command], { cwd: repo }, (err, stdout, stderr) => {
      const output = `${stdout ?? ""}${stderr ?? ""}`;
      resolve({ passed: !err, output });
    });
    child.on("error", (err) => resolve({ passed: false, output: err.message }));
  });
}

async function runTask(name, args, runRoot) {
  const taskDir = path.join(TASKS_DIR, name);
  const task = fs.readFileSync(path.join(taskDir, "task.md"), "utf-8");
  const check = `bash ${path.join(taskDir, "check.sh")}`;
  const runDir = path.join(runRoot, name);
  const repo = await prepareRepo(taskDir, runDir);

  const testFiles = await seedTestFiles(repo);
  const started = Date.now();
  const result = await delegateTask(
    { task, cwd: repo, check, maxMinutes: args.maxMinutes },
    {
      opencodeBin: process.env.LOCAL_AGENT_OPENCODE_BIN || "opencode",
      configPath: AGENT_CONFIG,
      stateDir: path.join(runDir, "state"),
      baseUrl: args.baseUrl,
      ctxSize: args.ctxSize,
      sampling: () => ({ temperature: 0.0 }),
    }
  );
  const elapsedMs = Date.now() - started;

  // Independently re-verify: put the original tests back, then run the check
  // again. A model that passed by weakening the tests is caught here.
  let verified = null;
  if (testFiles.length) {
    await git(repo, "checkout", "HEAD", "--", ...testFiles);
    verified = await runCheck(repo, check);
  }
  const tampered = (result.changes ?? []).some((c) => testFiles.includes(c.path));
  const changes = (result.changes ?? []).filter((c) => !testFiles.includes(c.path));

  return {
    task: name,
    passed: verified ? verified.passed : result.checkResult?.passed ?? false,
    agentCheckPassed: result.checkResult?.passed ?? false,
    tampered,
    outcome: result.outcome,
    elapsedMs,
    changes: changes.length,
    changedFiles: changes.map((c) => c.path),
    checkTail: (verified?.output ?? result.checkResult?.tail ?? "").trim().split("\n").slice(-3).join(" | "),
    summary: result.summary,
    runDir,
  };
}

const args = parseArgs(process.argv.slice(2));
const names = fs
  .readdirSync(TASKS_DIR)
  .filter((name) => fs.existsSync(path.join(TASKS_DIR, name, "task.md")))
  .filter((name) => !args.task || name === args.task)
  .sort();

if (!names.length) throw new Error(`No tasks found under ${TASKS_DIR}`);

const label = args.label || path.basename(new URL(args.baseUrl).hostname) + ":" + new URL(args.baseUrl).port;
const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), "local-eval-"));
const results = [];

for (const name of names) {
  process.stderr.write(`\n>>> ${label} :: ${name}\n`);
  try {
    const r = await runTask(name, args, runRoot);
    results.push(r);
    const secs = Math.round(r.elapsedMs / 1000);
    const flags = [r.tampered ? "TAMPERED TESTS" : null, r.agentCheckPassed && !r.passed ? "failed re-verify" : null].filter(Boolean);
    process.stderr.write(`    ${r.passed ? "PASS" : "FAIL"} (${secs}s, ${r.changes} files, ${r.outcome}${flags.length ? ", " + flags.join(", ") : ""})\n`);
  } catch (err) {
    results.push({ task: name, passed: false, outcome: `error: ${err.message}`, elapsedMs: 0, changes: 0 });
    process.stderr.write(`    ERROR: ${err.message}\n`);
  }
}

const passed = results.filter((r) => r.passed).length;
console.log(`\n${label}: ${passed}/${results.length} tasks passed`);
for (const r of results) {
  console.log(`  ${r.passed ? "PASS" : "FAIL"}  ${r.task}  ${Math.round(r.elapsedMs / 1000)}s  ${r.changes} files  ${r.outcome}${r.tampered ? "  (tampered tests)" : ""}`);
}

if (args.out) {
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify({ label, baseUrl: args.baseUrl, passed, total: results.length, results }, null, 2));
  console.log(`Report: ${args.out}`);
}
