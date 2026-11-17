import io
import json
import unittest

from notes.cli import main
from notes_fixture import make_store


def export(*extra):
    out = io.StringIO()
    main(["export", "--format", "json", *extra], store=make_store(), out=out)
    return out.getvalue()


class JsonExportTest(unittest.TestCase):
    def test_structure(self):
        data = json.loads(export())
        self.assertEqual(data["version"], 1)
        self.assertEqual(data["count"], 3)
        self.assertEqual([n["id"] for n in data["notes"]], [1, 3, 4])

    def test_note_fields(self):
        kickoff = json.loads(export())["notes"][0]
        self.assertEqual(kickoff["title"], "Kickoff")
        self.assertEqual(kickoff["tags"], ["meeting", "work"])
        self.assertEqual(kickoff["created"], "2026-03-01T10:00:00Z")

    def test_all_includes_archived(self):
        data = json.loads(export("--all"))
        self.assertEqual([n["id"] for n in data["notes"]], [1, 2, 3, 4])


if __name__ == "__main__":
    unittest.main()
