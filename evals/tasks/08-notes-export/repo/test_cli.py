import io
import unittest

from notes.cli import main
from notes_fixture import make_store


def run(*argv, store):
    out = io.StringIO()
    code = main(list(argv), store=store, out=out)
    return code, out.getvalue()


class CliTest(unittest.TestCase):
    def setUp(self):
        self.store = make_store()

    def test_list_hides_archived(self):
        _, text = run("list", store=self.store)
        self.assertEqual([line.split()[0] for line in text.splitlines()], ["1", "3", "4"])

    def test_list_all(self):
        _, text = run("list", "--all", store=self.store)
        self.assertEqual([line.split()[0] for line in text.splitlines()], ["1", "2", "3", "4"])

    def test_add_and_tag(self):
        run("add", "New", "text", "--tags", "A, b", store=self.store)
        note = [n for n in self.store.load() if n.title == "New"][0]
        self.assertEqual(note.tags, {"a", "b"})
        run("tag", str(note.id), "c", store=self.store)
        self.assertEqual([n for n in self.store.load() if n.id == note.id][0].tags, {"c"})

    def test_markdown_export(self):
        _, text = run("export", store=self.store)
        self.assertTrue(text.startswith("## Kickoff\n\n_01 Mar 2026_ #meeting #work\n"))

    def test_csv_export(self):
        _, text = run("export", "--format", "csv", store=self.store)
        self.assertEqual(text.splitlines()[1], "1,Kickoff,2026-03-01T10:00:00Z,meeting;work")

    def test_search_tag(self):
        _, text = run("search", "#home", store=self.store)
        self.assertIn("Grocery list", text)


if __name__ == "__main__":
    unittest.main()
