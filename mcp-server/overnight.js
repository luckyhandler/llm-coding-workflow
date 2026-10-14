#!/usr/bin/env node
/**
 * Overnight runner: execute a plan written during the day, task by task, against
 * the local model through the real delegate_task harness.
 *
 * Where delegate_task runs one brief for up to 30 minutes, this drives a whole
 * plan unattended:
 *   - tasks run in order and each one is verified with its own `check` command;
 *   - a failed attempt is retried with the failure fed back into the brief, so a
 *     loop-kill or a failing check becomes another attempt instead of the end of
 *     the run;
 *   - progress is written to a state file after every attempt, so a crash, a
 *     reboot, or Ctrl-C resumes where it left off;
 *   - optional `--commit` checkpoints each verified task, so the morning diff is
 *     a stack of revertible commits rather than one unknown blob;
 *   - a deadline stops the run cleanly and a report is written for the morning.
 *
 * Usage:
 *   node mcp-server/overnight.js <plan.md> [--base-url URL] [--ctx-size N]
 *       [--retries N] [--max-hours N] [--commit] [--dry-run] [--report FILE]
 *
 * Plan format (see evals/plans/example.md):
 *
 *   # Overnight plan: <title>
 *   repo: /absolute/path/to/repo
 *
 *   ## Task: <id>
 *   check: npm test -- auth
 *   max_minutes: 20
 *   retries: 3
 *
 *   Free-form brief: goal, constraints, starting points, acceptance criteria.
 */

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { delegateTask } from "./delegate.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const AGENT_CONFIG = path.join(REPO_ROOT, "agent-worker", "opencode.json");

function parseArgs(argv) {
  const args = {
    baseUrl: "http://127.0.0.1:8090/v1",
    ctxSize: 131072,
    retries: 3,
    maxHours: 0,
    maxMinutes: 30,
    commit: false,
    dryRun: false,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const next = () => argv[++i];
    switch (argv[i]) {
      case "--base-url": args.baseUrl = next(); break;
      case "--ctx-size": args.ctxSize = Number(next()); break;
      case "--retries": args.retries = Number(next()); break;
      case "--max-hours": args.maxHours = Number(next()); break;
      case "--max-minutes": args.maxMinutes = Number(next()); break;
      case "--report": args.report = next(); break;
      case "--commit": args.commit = true; break;
      case "--dry-run": args.dryRun = true; break;
      default:
        if (argv[i].startsWith("--")) throw new Error(`Unknown option: ${argv[i]}`);
        positional.push(argv[i]);
    }
  }
  args.planPath = positional[0];
  if (!args.planPath) throw new Error("Usage: overnight.js <plan.md> [options]");
  return args;
}

/**
 * Parse a plan into { title, repo, tasks }. A task's metadata lines (`check`,
 * `cwd`, `max_minutes`, `retries`) must come before its brief; blank lines
 * before the first metadata or brief line are ignored.
 */
export function parsePlan(text) {
  const plan = { title: "", repo: "", tasks: [] };
  let current = null;
  let brief = [];
  let briefStarted = false;

  const flush = () => {
    if (!current) return;
    current.brief = brief.join("\n").trim();
    plan.tasks.push(current);
    current = null;
    brief = [];
    briefStarted = false;
  };

  for (const line of text.split("\n")) {
    const taskMatch = /^##\s+Task:\s*(.+?)\s*$/.exec(line);
    if (taskMatch) {
      flush();
      current = { id: taskMatch[1], cwd: "", check: "", maxMinutes: null, retries: null };
      continue;
    }

    if (!current) {
      const repo = /^repo:\s*(.+?)\s*$/.exec(line);
      if (repo) { plan.repo = repo[1]; continue; }
      const title = /^#\s+(.+?)\s*$/.exec(line);
      if (title) { plan.title = title[1]; continue; }
      continue;
    }

    if (!briefStarted) {
      if (!line.trim()) continue;
      const meta = /^(cwd|check|max_minutes|retries|protect):\s*(.*)$/.exec(line);
      if (meta) {
        const [, key, value] = meta;
        if (key === "cwd") current.cwd = value;
        else if (key === "check") current.check = value;
        else if (key === "max_minutes") current.maxMinutes = Number(value);
        else if (key === "retries") current.retries = Number(value);
        else if (key === "protect") current.protect = value.split(",").map((s) => s.trim()).filter(Boolean);
        continue;
      }
      briefStarted = true;
    }
    brief.push(line);
  }
  flush();
  return plan;
}

const readState = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return { tasks: {} };
  }
};
const writeState = (file, state) => {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
};

async function gitCommit(cwd, message) {
  await execFileAsync("git", ["add", "-A"], { cwd });
  try {
    await execFileAsync(
      "git",
      ["-c", "user.email=overnight@local", "-c", "user.name=overnight-runner", "commit", "-qm", message],
      { cwd }
    );
    return true;
  } catch {
    return false; // Nothing staged, or a hook refused the commit.
  }
}

/** Minimal glob matcher: `*` and `?` within a path segment, plus a bare name. */
export function matchesAny(file, patterns) {
  return (patterns ?? []).some((glob) => {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
    return new RegExp(`(^|/)${escaped}$`).test(file);
  });
}

/** Existing tracked files matching the task's `protect:` globs. */
async function protectedFiles(cwd, patterns) {
  if (!patterns?.length) return [];
  const { stdout } = await execFileAsync("git", ["ls-files", "--", ...patterns], { cwd });
  return stdout.split("\n").filter(Boolean);
}

function runCheckCommand(cwd, command) {
  return new Promise((resolve) => {
    const shell = process.env.SHELL || "/bin/bash";
    execFile(shell, ["-lc", command], { cwd }, (err, stdout, stderr) => {
      resolve({ passed: !err, output: `${stdout ?? ""}${stderr ?? ""}` });
    });
  });
}

function attemptFeedback(state) {
  if (!state.attempts) return "";
  const lines = [
    "",
    "",
    "---",
    `This is attempt ${state.attempts + 1}. The previous attempt did not pass.`,
  ];
  if (state.lastOutcome) lines.push(`It ended: ${state.lastOutcome}.`);
  if (state.lastCheckTail) lines.push(`The check reported:\n${state.lastCheckTail}`);
  lines.push(
    "Change approach rather than repeating the previous one. Re-read the relevant files before editing."
  );
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const planAbs = path.resolve(args.planPath);
  const plan = parsePlan(fs.readFileSync(planAbs, "utf-8"));
  const stateFile = `${planAbs}.state.json`;
  const reportFile = args.report || `${planAbs}.report.md`;
  const state = readState(stateFile);
  state.plan = planAbs;

  const defaultCwd = plan.repo ? path.resolve(path.dirname(planAbs), plan.repo) : "";
  if (!plan.tasks.length) throw new Error(`No "## Task:" sections found in ${planAbs}`);

  if (args.dryRun) {
    console.log(`Plan: ${plan.title || "(untitled)"}  (${plan.tasks.length} tasks)`);
    for (const t of plan.tasks) {
      const st = state.tasks[t.id] || {};
      console.log(`  [${st.status || "pending"}] ${t.id}  check=${t.check || "(none)"}  cwd=${t.cwd || defaultCwd}`);
    }
    return;
  }

  const deadline = args.maxHours > 0 ? Date.now() + args.maxHours * 3600_000 : 0;
  const stopForDeadline = () => deadline > 0 && Date.now() >= deadline;
  // Persist on interrupt so a Ctrl-C or a shutdown stays resumable.
  const onSignal = () => {
    writeState(stateFile, state);
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  console.log(`Overnight run: ${plan.tasks.length} tasks from ${planAbs}`);
  console.log(`State: ${stateFile}`);
  if (deadline) console.log(`Deadline: ${new Date(deadline).toLocaleString()} (${args.maxHours}h)`);

  for (const task of plan.tasks) {
    const st = (state.tasks[task.id] ??= { status: "pending", attempts: 0 });
    if (st.status === "passed") {
      console.log(`\n[skip] ${task.id} (already passed)`);
      continue;
    }
    if (stopForDeadline()) {
      st.status = "skipped";
      writeState(stateFile, state);
      console.log(`\n[skip] ${task.id} (deadline reached)`);
      continue;
    }

    const cwd = path.resolve(task.cwd ? path.resolve(path.dirname(planAbs), task.cwd) : defaultCwd);
    if (!cwd) throw new Error(`Task ${task.id} has no cwd and the plan has no repo:`);
    const maxMinutes = task.maxMinutes || args.maxMinutes;
    const retries = task.retries || args.retries;
    const protectList = await protectedFiles(cwd, task.protect);

    for (let attempt = 0; attempt < retries && !stopForDeadline(); attempt += 1) {
      console.log(`\n[run ] ${task.id} attempt ${attempt + 1}/${retries} (cwd=${cwd}, ${maxMinutes}min)`);
      const brief = task.brief + attemptFeedback(st);
      st.status = "running";
      st.attempts = attempt + 1;
      st.lastCheckTail = "";
      st.lastOutcome = "";
      writeState(stateFile, state);

      let result;
      try {
        result = await delegateTask(
          { task: brief, cwd, check: task.check || undefined, maxMinutes },
          {
            opencodeBin: process.env.LOCAL_AGENT_OPENCODE_BIN || "opencode",
            configPath: AGENT_CONFIG,
            stateDir: path.join(path.dirname(planAbs), ".overnight-state"),
            baseUrl: args.baseUrl,
            ctxSize: args.ctxSize,
            sampling: () => ({ temperature: 0.0 }),
          }
        );
      } catch (err) {
        st.lastOutcome = `error: ${err.message}`;
        writeState(stateFile, state);
        console.log(`      error: ${err.message}`);
        continue;
      }

      let passed = result.checkResult?.passed ?? false;
      let tampered = false;
      // If the agent edited a protected file (e.g. weakened a test), restore it
      // and re-run the check ourselves. A pass must survive the original tests.
      if (protectList.length && task.check) {
        const edited = (
          await execFileAsync("git", ["diff", "--name-only", "HEAD", "--", ...protectList], { cwd })
        ).stdout.split("\n").filter(Boolean);
        // Newly created files can satisfy a check just as easily as a weakened
        // test can (e.g. the agent dropping in an empty test module).
        const created = (await execFileAsync("git", ["ls-files", "--others", "--exclude-standard"], { cwd }))
          .stdout.split("\n")
          .filter(Boolean)
          .filter((f) => matchesAny(f, task.protect));
        if (edited.length || created.length) {
          tampered = true;
          if (edited.length) await execFileAsync("git", ["checkout", "HEAD", "--", ...edited], { cwd });
          for (const f of created) fs.rmSync(path.join(cwd, f), { force: true });
          const reverified = await runCheckCommand(cwd, task.check);
          passed = reverified.passed;
          result.checkResult = { passed, tail: reverified.output };
        }
      }

      st.lastOutcome = result.outcome;
      st.lastTampered = tampered;
      st.lastCheckTail = passed ? "" : result.checkResult?.tail?.trim().split("\n").slice(-15).join("\n") ?? "";
      st.sessionId = result.sessionId ?? st.sessionId;
      st.changedFiles = (result.changes ?? []).map((c) => `${c.status} ${c.path}`);

      if (tampered) {
        console.log(`      protected files were modified; restored${passed ? " and re-verified PASS" : " and re-verified FAIL"}`);
      }

      if (passed) {
        st.status = "passed";
        st.finishedAt = new Date().toISOString();
        writeState(stateFile, state);
        console.log(`      PASS (${st.changedFiles.length} files changed)`);
        if (args.commit) {
          const committed = await gitCommit(cwd, `overnight(${task.id}): ${task.brief.split("\n")[0].slice(0, 60)}`);
          console.log(committed ? "      committed" : "      nothing to commit");
        }
        break;
      }

      st.status = "failed";
      writeState(stateFile, state);
      console.log(`      FAIL: ${result.outcome}`);
      if (st.lastCheckTail) console.log(`      check: ${st.lastCheckTail.split("\n").slice(-2).join(" | ")}`);
    }
  }

  const results = plan.tasks.map((t) => ({ id: t.id, ...(state.tasks[t.id] || { status: "pending" }) }));
  const passed = results.filter((r) => r.status === "passed").length;
  const report = [
    `# Overnight report: ${plan.title || path.basename(planAbs)}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    `Plan: ${planAbs}`,
    `Result: ${passed}/${results.length} tasks passed`,
    "",
    "| Task | Status | Attempts | Files | Protected files touched |",
    "| --- | --- | --- | --- | --- |",
    ...results.map(
      (r) => `| ${r.id} | ${r.status} | ${r.attempts ?? 0} | ${(r.changedFiles ?? []).length} | ${r.lastTampered ? "yes (restored)" : "no"} |`
    ),
    "",
  ];
  for (const r of results) {
    if (r.status === "passed") continue;
    report.push(`## ${r.id} — ${r.status}`, "", `Last outcome: ${r.lastOutcome || "n/a"}`, "");
    if (r.lastCheckTail) report.push("```", r.lastCheckTail, "```", "");
    if (r.changedFiles?.length) report.push("Changed files:", ...r.changedFiles.map((f) => `- ${f}`), "");
  }
  fs.writeFileSync(reportFile, report.join("\n"));
  writeState(stateFile, state);

  console.log(`\n${passed}/${results.length} tasks passed. Report: ${reportFile}`);
  console.log("Resume by re-running the same command; passed tasks are skipped.");
}

// Run only when invoked directly, so tests can import parsePlan.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
