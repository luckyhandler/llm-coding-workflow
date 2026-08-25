# Global MCP registry

This directory is the single source of truth for user-level MCP servers shared by local agent clients. `registry.json` was normalized from the active user configurations in the supplied backup; cached plugin manifests were deliberately excluded.

## What was imported

The registry contains the deduplicated union of active Claude Code, Codex, Cursor, Antigravity, and VS Code MCP configurations:

- Asana, Atlassian, Context7, Figma, GitHub, Miro, and OpenAI developer docs over HTTP
- BigQuery, Dart, Firebase, local Gemma, and Mempalace over stdio
- JetBrains over legacy SSE, limited to Claude and Cursor because the other configured clients expect stdio or Streamable HTTP

Codex app-internal servers such as `node_repl` and Computer Use are not in the registry. The installer preserves them as unmanaged Codex configuration. Plugin-cache MCP manifests were also excluded because plugins own their lifecycle and often contain version-specific paths.

The legacy Cursor Asana entry contained an OAuth client secret in its command arguments. It has been replaced by the native Asana HTTP endpoint with OAuth; no copied credential is stored here.

## Commands

Run these from this directory:

```bash
python3 mcp_sync.py validate
python3 mcp_sync.py render
python3 mcp_sync.py check
```

`render` writes reviewable native configurations to `generated/` without touching any agent settings.

The OpenCode renderer detects the installed major version. OpenCode 1.x receives the legacy direct `mcp` map; OpenCode 2.x receives the current `mcp.servers` layout. Use `--opencode-format v1` or `--opencode-format v2` only when rendering for a different machine.

To install all generated configurations into the current user's normal global locations:

```bash
python3 mcp_sync.py apply
```

Or update selected clients:

```bash
python3 mcp_sync.py apply --clients codex,claude,opencode
```

The installer:

- merges MCP entries into JSON configurations while preserving unrelated settings and unmanaged servers;
- replaces only corresponding MCP tables in Codex TOML;
- replaces only the top-level `mcp_servers` section in Hermes YAML;
- makes timestamped backups under `~/.config/mcp/backups/`;
- records managed server names in `~/.config/mcp/state.json` so later syncs can remove stale managed entries.

OAuth credentials remain client-specific. After applying, use each client's MCP login or authentication interface where required. `GITHUB_PAT_TOKEN` is used by the Codex adapter when present; the token value is never stored in the registry.

OpenCode also expands `GITHUB_PAT_TOKEN` into an authorization header at runtime. OpenCode 1.x cannot dynamically register with the Asana OAuth server, so Asana requires a separately registered OAuth client or an OpenCode upgrade; the exposed legacy client secret from the backup is intentionally not reused.

## Generated destinations

| Client | Global destination |
| --- | --- |
| Claude Code | `~/.claude.json` |
| Codex | `~/.codex/config.toml` |
| Cursor | `~/.cursor/mcp.json` |
| OpenCode V2 | `~/.config/opencode/opencode.json` |
| Hermes | `~/.hermes/config.yaml` |
| Antigravity | `~/.gemini/antigravity-ide/mcp_config.json` |
| VS Code | `~/Library/Application Support/Code/User/mcp.json` |

Do not edit files in `generated/`; edit `registry.json` and render again.
