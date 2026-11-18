import hashlib
import io
import json
import pathlib
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

from notes.cli import build_parser, main
from notes.models import Note
from notes.registry import EXPORTERS
from notes.storage import JsonlStore

UNCHANGED = {
    "notes/commands/export.py": "0e47c3b91b744e81a1fe46631b004ff318603fd8a70083e5a0823b8b01601be4",
    "notes/cli.py": "50d0871324d37e200c990568314c5d29416c46fa2ae1bbe2a780043e6ca6e446",
}

BERLIN = timezone(timedelta(hours=1))


def _store(notes):
    store = JsonlStore(pathlib.Path(tempfile.mkdtemp()) / "n.jsonl")
    store.save(notes)
    return store


def _export(store, *extra):
    out = io.StringIO()
    main(["export", "--format", "json", *extra], store=store, out=out)
    return out.getvalue()


class HiddenNotesTest(unittest.TestCase):
    def test_export_command_and_cli_unchanged(self):
        root = pathlib.Path(__file__).parent
        for rel, digest in UNCHANGED.items():
            with self.subTest(rel=rel):
                self.assertEqual(hashlib.sha256((root / rel).read_bytes()).hexdigest(), digest)

    def test_registered_as_exporter(self):
        self.assertIn("json", EXPORTERS)
        self.assertEqual(sorted(EXPORTERS), ["csv", "json", "md"])

    def test_cli_accepts_format(self):
        args = build_parser().parse_args(["export", "--format", "json"])
        self.assertEqual(args.format, "json")

    def test_exact_output(self):
        store = _store([
            Note(7, "Grüße", "Café ☕", datetime(2026, 1, 2, 0, 30, tzinfo=BERLIN),
                 tags=frozenset({"z", "a"})),
            Note(5, "Plain", "", datetime(2026, 1, 2, 9, 0, tzinfo=timezone.utc),
                 datetime(2026, 1, 3, 18, 15, 5, tzinfo=timezone.utc)),
        ])
        expected = (
            '{\n'
            '  "version": 1,\n'
            '  "count": 2,\n'
            '  "notes": [\n'
            '    {\n'
            '      "id": 7,\n'
            '      "title": "Grüße",\n'
            '      "body": "Café ☕",\n'
            '      "tags": [\n'
            '        "a",\n'
            '        "z"\n'
            '      ],\n'
            '      "created": "2026-01-01T23:30:00Z",\n'
            '      "updated": null,\n'
            '      "archived": false\n'
            '    },\n'
            '    {\n'
            '      "id": 5,\n'
            '      "title": "Plain",\n'
            '      "body": "",\n'
            '      "tags": [],\n'
            '      "created": "2026-01-02T09:00:00Z",\n'
            '      "updated": "2026-01-03T18:15:05Z",\n'
            '      "archived": false\n'
            '    }\n'
            '  ]\n'
            '}\n'
        )
        self.assertEqual(_export(store), expected)

    def test_archived_filtering_and_flag(self):
        t = datetime(2026, 2, 1, tzinfo=timezone.utc)
        store = _store([Note(1, "a", "", t, archived=True), Note(2, "b", "", t)])
        self.assertEqual([n["id"] for n in json.loads(_export(store))["notes"]], [2])
        data = json.loads(_export(store, "--all"))
        self.assertEqual(data["count"], 2)
        self.assertEqual([(n["id"], n["archived"]) for n in data["notes"]], [(1, True), (2, False)])

    def test_empty_store(self):
        self.assertEqual(json.loads(_export(_store([]))), {"version": 1, "count": 0, "notes": []})

    def test_other_formats_still_work(self):
        t = datetime(2026, 2, 1, tzinfo=timezone.utc)
        store = _store([Note(1, "a", "body", t, tags=frozenset({"x"}))])
        out = io.StringIO()
        main(["export", "--format", "csv"], store=store, out=out)
        self.assertEqual(out.getvalue(), "id,title,created,tags\n1,a,2026-02-01T00:00:00Z,x\n")


if __name__ == "__main__":
    unittest.main()
