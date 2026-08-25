#!/usr/bin/env python3
"""Render and safely install one canonical MCP registry for multiple clients."""

from __future__ import annotations

import argparse
import copy
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


CLIENTS = ("antigravity", "claude", "codex", "cursor", "hermes", "opencode", "vscode")
JSON_CLIENTS = {"antigravity", "claude", "cursor", "opencode", "vscode"}
BEGIN = "# >>> global-mcp-registry (managed; do not edit)"
END = "# <<< global-mcp-registry"
SERVER_NAME = re.compile(r"^[A-Za-z0-9_-]+$")


def fail(message: str) -> None:
    raise ValueError(message)


def load_registry(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read registry {path}: {exc}")
    validate_registry(data)
    return data


def validate_registry(data: Any) -> None:
    if not isinstance(data, dict) or data.get("version") != 1:
        fail("registry.version must be 1")
    servers = data.get("servers")
    if not isinstance(servers, dict):
        fail("registry.servers must be an object")
    defaults = data.get("defaults", {}).get("clients", list(CLIENTS))
    validate_clients(defaults, "defaults.clients")
    for name, server in servers.items():
        if not SERVER_NAME.fullmatch(name):
            fail(f"invalid server name {name!r}")
        if not isinstance(server, dict):
            fail(f"server {name!r} must be an object")
        transport = server.get("transport")
        if transport not in {"stdio", "http", "sse"}:
            fail(f"server {name!r} has invalid transport")
        if transport == "stdio" and not server.get("command"):
            fail(f"stdio server {name!r} requires command")
        if transport != "stdio" and not server.get("url"):
            fail(f"remote server {name!r} requires url")
        if "clients" in server:
            validate_clients(server["clients"], f"servers.{name}.clients")
        env = server.get("env", {})
        if not isinstance(env, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in env.items()):
            fail(f"servers.{name}.env must contain string values")
        token_var = server.get("bearer_token_env_var")
        if token_var is not None and not re.fullmatch(r"[A-Z_][A-Z0-9_]*", token_var):
            fail(f"servers.{name}.bearer_token_env_var must be an environment variable name")


def validate_clients(clients: Any, location: str) -> None:
    if not isinstance(clients, list) or not all(c in CLIENTS for c in clients):
        fail(f"{location} contains an unsupported client")
    if len(clients) != len(set(clients)):
        fail(f"{location} contains duplicates")


def servers_for(data: dict[str, Any], client: str) -> dict[str, dict[str, Any]]:
    default_clients = data.get("defaults", {}).get("clients", list(CLIENTS))
    return {
        name: server
        for name, server in sorted(data["servers"].items())
        if client in server.get("clients", default_clients)
    }


def common_stdio(server: dict[str, Any], include_type: bool = True) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if include_type:
        out["type"] = "stdio"
    out["command"] = server["command"]
    if server.get("args"):
        out["args"] = server["args"]
    if server.get("cwd"):
        out["cwd"] = server["cwd"]
    if server.get("env"):
        out["env"] = server["env"]
    if server.get("enabled") is False:
        out["disabled"] = True
    return out


def render_json_client(data: dict[str, Any], client: str, opencode_v2: bool = True) -> dict[str, Any]:
    rendered: dict[str, Any] = {}
    for name, server in servers_for(data, client).items():
        transport = server["transport"]
        if transport == "stdio":
            item = common_stdio(server, include_type=client in {"claude", "vscode"})
        elif client == "antigravity":
            item = {"httpUrl": server["url"]}
        else:
            item = {"type": transport, "url": server["url"]}
        rendered[name] = item
    if client == "vscode":
        return {"servers": rendered}
    if client == "opencode":
        oc_servers: dict[str, Any] = {}
        for name, server in servers_for(data, client).items():
            if server["transport"] == "stdio":
                item = {
                    "type": "local",
                    "command": [server["command"], *server.get("args", [])],
                }
                if server.get("cwd"):
                    item["cwd"] = server["cwd"]
                if server.get("env"):
                    item["environment"] = server["env"]
            else:
                if server["transport"] == "sse":
                    continue
                item = {"type": "remote", "url": server["url"]}
                if server.get("bearer_token_env_var"):
                    variable = server["bearer_token_env_var"]
                    item["headers"] = {"Authorization": f"Bearer {{env:{variable}}}"}
                    item["oauth"] = False
                elif server.get("auth") == "none":
                    item["oauth"] = False
            if server.get("enabled") is False:
                item["disabled"] = True
            elif not opencode_v2:
                item["enabled"] = True
            oc_servers[name] = item
        if opencode_v2:
            return {"$schema": "https://opencode.ai/config.json", "mcp": {"servers": oc_servers}}
        for item in oc_servers.values():
            if item.pop("disabled", False):
                item["enabled"] = False
        return {"$schema": "https://opencode.ai/config.json", "mcp": oc_servers}
    return {"mcpServers": rendered}


def toml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def toml_array(values: list[str]) -> str:
    return "[" + ", ".join(toml_string(value) for value in values) + "]"


def render_codex(data: dict[str, Any]) -> str:
    lines = [BEGIN]
    for name, server in servers_for(data, "codex").items():
        if server["transport"] == "sse":
            continue
        lines.append(f"[mcp_servers.{name}]")
        if server["transport"] == "stdio":
            lines.append(f"command = {toml_string(server['command'])}")
            if server.get("args"):
                lines.append(f"args = {toml_array(server['args'])}")
            if server.get("cwd"):
                lines.append(f"cwd = {toml_string(server['cwd'])}")
        else:
            lines.append(f"url = {toml_string(server['url'])}")
            if server.get("bearer_token_env_var"):
                lines.append(f"bearer_token_env_var = {toml_string(server['bearer_token_env_var'])}")
            elif server.get("auth") == "oauth":
                lines.append('auth = "oauth"')
        if server.get("enabled") is False:
            lines.append("enabled = false")
        if server.get("env"):
            lines.append("")
            lines.append(f"[mcp_servers.{name}.env]")
            for key, value in sorted(server["env"].items()):
                lines.append(f"{key} = {toml_string(value)}")
        lines.append("")
    lines.append(END)
    return "\n".join(lines).rstrip() + "\n"


def yaml_scalar(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def render_hermes(data: dict[str, Any]) -> str:
    lines = [BEGIN, "mcp_servers:"]
    for name, server in servers_for(data, "hermes").items():
        if server["transport"] == "sse":
            continue
        lines.append(f"  {name}:")
        if server["transport"] == "stdio":
            lines.append(f"    command: {yaml_scalar(server['command'])}")
            if server.get("args"):
                lines.append("    args:")
                lines.extend(f"      - {yaml_scalar(arg)}" for arg in server["args"])
            if server.get("cwd"):
                lines.append(f"    cwd: {yaml_scalar(server['cwd'])}")
            if server.get("env"):
                lines.append("    env:")
                for key, value in sorted(server["env"].items()):
                    lines.append(f"      {key}: {yaml_scalar(value)}")
        else:
            lines.append(f"    url: {yaml_scalar(server['url'])}")
            if server.get("auth") == "oauth":
                lines.append("    auth: oauth")
        if server.get("enabled") is False:
            lines.append("    enabled: false")
    lines.append(END)
    return "\n".join(lines) + "\n"


def render_all(data: dict[str, Any], opencode_v2: bool = True) -> dict[str, str]:
    result: dict[str, str] = {}
    for client in JSON_CLIENTS:
        result[client] = json.dumps(
            render_json_client(data, client, opencode_v2=opencode_v2), indent=2, sort_keys=True
        ) + "\n"
    result["codex"] = render_codex(data)
    result["hermes"] = render_hermes(data)
    return result


def output_names() -> dict[str, str]:
    return {
        "antigravity": "antigravity.mcp.json",
        "claude": "claude.mcp.json",
        "codex": "codex.mcp.toml",
        "cursor": "cursor.mcp.json",
        "hermes": "hermes.mcp.yaml",
        "opencode": "opencode.mcp.json",
        "vscode": "vscode.mcp.json",
    }


def write_rendered(rendered: dict[str, str], output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    for client, filename in output_names().items():
        atomic_write(output / filename, rendered[client])


def destinations(home: Path) -> dict[str, Path]:
    return {
        "antigravity": home / ".gemini/antigravity-ide/mcp_config.json",
        "claude": home / ".claude.json",
        "codex": home / ".codex/config.toml",
        "cursor": home / ".cursor/mcp.json",
        "hermes": home / ".hermes/config.yaml",
        "opencode": home / ".config/opencode/opencode.json",
        "vscode": home / "Library/Application Support/Code/User/mcp.json",
    }


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write(content)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def backup(path: Path, backup_root: Path, home: Path) -> None:
    if not path.exists():
        return
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    try:
        relative = path.relative_to(home)
    except ValueError:
        relative = Path(path.name)
    target = backup_root / stamp / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, target)


def load_state(path: Path) -> dict[str, list[str]]:
    if not path.exists():
        return {}
    try:
        state = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read state file {path}: {exc}")
    return state.get("managed_servers", {})


def strip_managed_block(text: str) -> str:
    pattern = re.compile(rf"(?ms)^\s*{re.escape(BEGIN)}.*?^\s*{re.escape(END)}\s*\n?")
    return pattern.sub("", text).rstrip() + ("\n" if text.strip() else "")


def toml_header_name(line: str) -> str | None:
    match = re.match(r"^\s*\[mcp_servers\.([A-Za-z0-9_-]+)(?:\.[^]]+)?\]\s*(?:#.*)?$", line)
    return match.group(1) if match else None


def remove_toml_servers(text: str, names: set[str]) -> str:
    text = strip_managed_block(text)
    lines = text.splitlines(keepends=True)
    result: list[str] = []
    skipping = False
    for line in lines:
        if re.match(r"^\s*\[", line):
            name = toml_header_name(line)
            skipping = name in names if name is not None else False
        if not skipping:
            result.append(line)
    return "".join(result).rstrip() + ("\n" if result else "")


def merge_json(existing: dict[str, Any], generated: dict[str, Any], client: str, old_names: set[str]) -> dict[str, Any]:
    result = copy.deepcopy(existing)
    if client == "vscode":
        pool = result.setdefault("servers", {})
        new_pool = generated["servers"]
    elif client == "opencode":
        result.setdefault("$schema", generated["$schema"])
        mcp = result.setdefault("mcp", {})
        if "servers" in generated["mcp"]:
            pool = mcp.setdefault("servers", {})
            new_pool = generated["mcp"]["servers"]
        else:
            stale_v2 = mcp.get("servers")
            if isinstance(stale_v2, dict) and set(stale_v2).issubset(old_names):
                mcp.pop("servers")
            pool = mcp
            new_pool = generated["mcp"]
    else:
        pool = result.setdefault("mcpServers", {})
        new_pool = generated["mcpServers"]
    if not isinstance(pool, dict):
        fail(f"existing {client} MCP section is not an object")
    for name in old_names:
        pool.pop(name, None)
    pool.update(new_pool)
    return result


def replace_yaml_mcp_block(text: str, generated: str) -> str:
    text = strip_managed_block(text)
    lines = text.splitlines(keepends=True)
    result: list[str] = []
    skipping = False
    for line in lines:
        if re.match(r"^mcp_servers:\s*(?:#.*)?$", line):
            skipping = True
            continue
        if skipping and re.match(r"^[A-Za-z_][A-Za-z0-9_-]*:\s*", line):
            skipping = False
        if not skipping:
            result.append(line)
    prefix = "".join(result).rstrip()
    return (prefix + "\n\n" if prefix else "") + generated


def apply_configs(
    data: dict[str, Any], rendered: dict[str, str], home: Path, clients: list[str], opencode_v2: bool = True
) -> None:
    config_root = home / ".config/mcp"
    state_path = config_root / "state.json"
    old_state = load_state(state_path)
    new_state = copy.deepcopy(old_state)
    generated_json = {
        client: render_json_client(data, client, opencode_v2=opencode_v2) for client in JSON_CLIENTS
    }
    for client in clients:
        target = destinations(home)[client]
        backup(target, config_root / "backups", home)
        existing_text = target.read_text() if target.exists() else ""
        old_names = set(old_state.get(client, []))
        if client in JSON_CLIENTS:
            if existing_text.strip():
                try:
                    existing = json.loads(existing_text)
                except json.JSONDecodeError as exc:
                    fail(f"refusing to rewrite non-JSON {target}: {exc}")
            else:
                existing = {}
            merged = merge_json(existing, generated_json[client], client, old_names)
            content = json.dumps(merged, indent=2, sort_keys=True) + "\n"
        elif client == "codex":
            managed = old_names | set(servers_for(data, "codex"))
            prefix = remove_toml_servers(existing_text, managed).rstrip()
            content = (prefix + "\n\n" if prefix else "") + rendered[client]
        else:
            content = replace_yaml_mcp_block(existing_text, rendered[client])
        atomic_write(target, content)
        new_state[client] = sorted(servers_for(data, client))
        print(f"updated {client}: {target}")
    state_payload = {"version": 1, "managed_servers": new_state}
    atomic_write(state_path, json.dumps(state_payload, indent=2, sort_keys=True) + "\n")


def check_commands(data: dict[str, Any]) -> int:
    missing: dict[str, list[str]] = {}
    for name, server in data["servers"].items():
        if server["transport"] != "stdio":
            continue
        command = server["command"]
        found = Path(command).exists() if "/" in command else shutil.which(command) is not None
        if not found:
            missing.setdefault(command, []).append(name)
    if missing:
        for command, names in sorted(missing.items()):
            print(f"missing command {command!r} (used by {', '.join(names)})", file=sys.stderr)
        return 1
    print("all local MCP launch commands are available")
    return 0


def detect_opencode_v2() -> bool:
    executable = shutil.which("opencode")
    if not executable:
        return True
    try:
        completed = subprocess.run(
            [executable, "--version"], check=False, capture_output=True, text=True, timeout=5
        )
        major = int(completed.stdout.strip().split(".", 1)[0])
        return major >= 2
    except (OSError, subprocess.SubprocessError, ValueError):
        return True


def parse_args() -> argparse.Namespace:
    base = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("validate", "render", "check", "apply"))
    parser.add_argument("--registry", type=Path, default=base / "registry.json")
    parser.add_argument("--output", type=Path, default=base / "generated")
    parser.add_argument("--home", type=Path, default=Path.home(), help="target home; useful for testing")
    parser.add_argument("--clients", default=",".join(CLIENTS), help="comma-separated client names")
    parser.add_argument(
        "--opencode-format",
        choices=("auto", "v1", "v2"),
        default="auto",
        help="OpenCode config layout; auto detects the installed major version",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        data = load_registry(args.registry)
        if args.command == "validate":
            print(f"valid registry: {len(data['servers'])} servers")
            return 0
        if args.command == "check":
            return check_commands(data)
        opencode_v2 = detect_opencode_v2() if args.opencode_format == "auto" else args.opencode_format == "v2"
        rendered = render_all(data, opencode_v2=opencode_v2)
        write_rendered(rendered, args.output)
        print(f"rendered {len(rendered)} client configurations to {args.output}")
        if args.command == "apply":
            clients = [value.strip() for value in args.clients.split(",") if value.strip()]
            validate_clients(clients, "--clients")
            apply_configs(data, rendered, args.home.resolve(), clients, opencode_v2=opencode_v2)
        return 0
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
