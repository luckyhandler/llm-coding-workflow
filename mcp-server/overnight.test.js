import assert from "node:assert/strict";
import test from "node:test";
import { matchesAny, parsePlan } from "./overnight.js";

const PLAN = `# Overnight plan: auth hardening

repo: /tmp/project

## Task: add-ratelimit
check: npm test -- ratelimit
max_minutes: 20
retries: 2

Add a rate limiter to the login endpoint.

Acceptance: the ratelimit test passes.

## Task: audit-logs
cwd: /tmp/other

Emit an audit log line on every failed login.
`;

test("parses title and repo", () => {
  const plan = parsePlan(PLAN);
  assert.equal(plan.title, "Overnight plan: auth hardening");
  assert.equal(plan.repo, "/tmp/project");
});

test("parses tasks in order with metadata", () => {
  const plan = parsePlan(PLAN);
  assert.equal(plan.tasks.length, 2);
  assert.equal(plan.tasks[0].id, "add-ratelimit");
  assert.equal(plan.tasks[0].check, "npm test -- ratelimit");
  assert.equal(plan.tasks[0].maxMinutes, 20);
  assert.equal(plan.tasks[0].retries, 2);
  assert.equal(plan.tasks[1].id, "audit-logs");
  assert.equal(plan.tasks[1].cwd, "/tmp/other");
  assert.equal(plan.tasks[1].check, "");
});

test("brief keeps blank lines after it starts", () => {
  const plan = parsePlan(PLAN);
  assert.equal(
    plan.tasks[0].brief,
    "Add a rate limiter to the login endpoint.\n\nAcceptance: the ratelimit test passes."
  );
});

test("parses protect globs", () => {
  const plan = parsePlan("## Task: t\nprotect: test_*.py, conftest.py\n\nDo it.\n");
  assert.deepEqual(plan.tasks[0].protect, ["test_*.py", "conftest.py"]);
});

test("matchesAny matches test globs and bare names", () => {
  assert.ok(matchesAny("test_auth.py", ["test_*.py"]));
  assert.ok(matchesAny("pkg/test_auth.py", ["test_*.py"]));
  assert.ok(matchesAny("conftest.py", ["conftest.py"]));
  assert.ok(matchesAny("src/auth.test.ts", ["*.test.ts"]));
  assert.ok(!matchesAny("auth.py", ["test_*.py"]));
  assert.ok(!matchesAny("test_auth.pyc", ["test_*.py"]));
});

test("handles a plan with no metadata", () => {
  const plan = parsePlan("# p\n\n## Task: solo\n\nJust do it.\n");
  assert.equal(plan.tasks.length, 1);
  assert.equal(plan.tasks[0].brief, "Just do it.");
  assert.equal(plan.tasks[0].check, "");
});
