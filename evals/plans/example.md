# Overnight plan: harden the auth module

repo: /absolute/path/to/your/repo

Each `## Task:` block becomes one delegate_task run. Metadata lines must come
before the brief. `protect:` lists files the agent must not change to pass — if
it edits them (or drops in a new file matching the pattern), the runner restores
them and re-runs the check before accepting a pass.

```bash
node mcp-server/overnight.js evals/plans/example.md --commit --max-hours 8
```

## Task: rate-limit-login
check: npm test -- --runInBand auth/rateLimit
protect: test/**, __tests__/**
max_minutes: 25
retries: 3

Add per-IP rate limiting to the login endpoint.

- Starting points: `src/auth/login.ts`, existing limiter in `src/util/limiter.ts`.
- Use the existing limiter; do not add a dependency.
- Acceptance: the rateLimit test suite passes unchanged.

## Task: audit-logs
check: npm test -- --runInBand auth/audit
protect: test/**, __tests__/**
max_minutes: 20
retries: 2

Emit a structured audit log line on every failed login attempt, including the
IP and the reason. Follow the logging conventions in `src/util/log.ts`.
