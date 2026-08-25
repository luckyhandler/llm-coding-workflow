import json
import tempfile
import unittest
from pathlib import Path

import mcp_sync


class McpSyncTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = Path(__file__).resolve().parent
        cls.registry = mcp_sync.load_registry(cls.base / "registry.json")

    def test_all_renderers_produce_expected_shapes(self):
        rendered = mcp_sync.render_all(self.registry)
        self.assertEqual(set(rendered), set(mcp_sync.CLIENTS))
        for client in mcp_sync.JSON_CLIENTS:
            json.loads(rendered[client])
        self.assertIn("[mcp_servers.context7]", rendered["codex"])
        self.assertIn("mcp_servers:", rendered["hermes"])

    def test_sse_is_limited_to_compatible_clients(self):
        self.assertIn("jetbrains", mcp_sync.servers_for(self.registry, "claude"))
        self.assertNotIn("jetbrains", mcp_sync.servers_for(self.registry, "codex"))
        self.assertNotIn("jetbrains", mcp_sync.servers_for(self.registry, "opencode"))

    def test_opencode_v1_and_v2_shapes(self):
        v1 = mcp_sync.render_json_client(self.registry, "opencode", opencode_v2=False)
        v2 = mcp_sync.render_json_client(self.registry, "opencode", opencode_v2=True)
        self.assertIn("context7", v1["mcp"])
        self.assertTrue(v1["mcp"]["context7"]["enabled"])
        self.assertIn("context7", v2["mcp"]["servers"])
        self.assertNotIn("enabled", v2["mcp"]["servers"]["context7"])
        self.assertEqual(
            v1["mcp"]["github"]["headers"]["Authorization"],
            "Bearer {env:GITHUB_PAT_TOKEN}",
        )
        self.assertFalse(v1["mcp"]["github"]["oauth"])

    def test_apply_preserves_unrelated_json_and_toml(self):
        rendered = mcp_sync.render_all(self.registry)
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            claude = home / ".claude.json"
            claude.write_text(json.dumps({"theme": "dark", "mcpServers": {"personal": {"command": "x"}}}))
            codex = home / ".codex/config.toml"
            codex.parent.mkdir(parents=True)
            codex.write_text('model = "keep-me"\n\n[mcp_servers.personal]\ncommand = "x"\n')
            mcp_sync.apply_configs(self.registry, rendered, home, ["claude", "codex"])
            claude_data = json.loads(claude.read_text())
            self.assertEqual(claude_data["theme"], "dark")
            self.assertIn("personal", claude_data["mcpServers"])
            codex_text = codex.read_text()
            self.assertIn('model = "keep-me"', codex_text)
            self.assertIn("[mcp_servers.personal]", codex_text)
            self.assertIn(mcp_sync.BEGIN, codex_text)

    def test_apply_replaces_adopted_codex_server_without_duplicates(self):
        rendered = mcp_sync.render_all(self.registry)
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            codex = home / ".codex/config.toml"
            codex.parent.mkdir(parents=True)
            codex.write_text('[mcp_servers.context7]\ncommand = "old"\n\n[features]\nfoo = true\n')
            mcp_sync.apply_configs(self.registry, rendered, home, ["codex"])
            text = codex.read_text()
            self.assertEqual(text.count("[mcp_servers.context7]"), 1)
            self.assertIn("[features]", text)

    def test_apply_converts_managed_opencode_v2_to_v1(self):
        rendered_v1 = mcp_sync.render_all(self.registry, opencode_v2=False)
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            config = home / ".config/opencode/opencode.json"
            config.parent.mkdir(parents=True)
            config.write_text(json.dumps({"mcp": {"servers": {"context7": {"type": "remote"}}}}))
            state = home / ".config/mcp/state.json"
            state.parent.mkdir(parents=True)
            state.write_text(json.dumps({"managed_servers": {"opencode": ["context7"]}}))
            mcp_sync.apply_configs(
                self.registry, rendered_v1, home, ["opencode"], opencode_v2=False
            )
            result = json.loads(config.read_text())
            self.assertNotIn("servers", result["mcp"])
            self.assertIn("context7", result["mcp"])


if __name__ == "__main__":
    unittest.main()
