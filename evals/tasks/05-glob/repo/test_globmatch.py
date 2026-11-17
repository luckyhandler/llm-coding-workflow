import unittest

from globmatch import glob_match


class GlobMatchTest(unittest.TestCase):
    def test_literal(self):
        self.assertTrue(glob_match("src/main.py", "src/main.py"))
        self.assertFalse(glob_match("src/main.py", "src/main.pyc"))

    def test_question_mark(self):
        self.assertTrue(glob_match("file?.txt", "file1.txt"))
        self.assertFalse(glob_match("file?.txt", "file12.txt"))
        self.assertFalse(glob_match("a?b", "a/b"))

    def test_star_stays_in_segment(self):
        self.assertTrue(glob_match("*.py", "main.py"))
        self.assertFalse(glob_match("*.py", "src/main.py"))
        self.assertTrue(glob_match("src/*", "src/main.py"))

    def test_double_star(self):
        self.assertTrue(glob_match("a/**/b", "a/b"))
        self.assertTrue(glob_match("a/**/b", "a/x/y/b"))
        self.assertTrue(glob_match("**/*.py", "main.py"))
        self.assertTrue(glob_match("**/*.py", "a/b/c/main.py"))
        self.assertFalse(glob_match("**/*.py", "a/b/main.js"))

    def test_classes(self):
        self.assertTrue(glob_match("[abc].txt", "b.txt"))
        self.assertTrue(glob_match("v[0-9]", "v7"))
        self.assertFalse(glob_match("v[!0-9]", "v7"))
        self.assertTrue(glob_match("v[!0-9]", "vx"))

    def test_braces(self):
        self.assertTrue(glob_match("*.{js,ts}", "app.ts"))
        self.assertFalse(glob_match("*.{js,ts}", "app.py"))

    def test_escape(self):
        self.assertTrue(glob_match(r"a\*b", "a*b"))
        self.assertFalse(glob_match(r"a\*b", "axb"))

    def test_hidden_files(self):
        self.assertFalse(glob_match("*", ".env"))
        self.assertTrue(glob_match(".*", ".env"))

    def test_errors(self):
        with self.assertRaises(ValueError):
            glob_match("[abc", "a")


if __name__ == "__main__":
    unittest.main()
