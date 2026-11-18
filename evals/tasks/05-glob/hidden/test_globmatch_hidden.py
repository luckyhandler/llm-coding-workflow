import time
import unittest

from globmatch import glob_match


class HiddenGlobTest(unittest.TestCase):
    def test_double_star_zero_segments_at_end(self):
        self.assertTrue(glob_match("x/**", "x"))
        self.assertTrue(glob_match("x/**", "x/y/z"))
        self.assertFalse(glob_match("x/**", "xy"))

    def test_double_star_inside_segment_is_star(self):
        self.assertTrue(glob_match("a**b", "axxb"))
        self.assertFalse(glob_match("a**b", "a/b"))
        self.assertFalse(glob_match("a**b", "ax/xb"))

    def test_double_star_backtracking(self):
        self.assertTrue(glob_match("**/a/**/b/**/c", "a/b/c"))
        self.assertTrue(glob_match("**/a/**/b/**/c", "x/a/y/a/b/z/c"))
        self.assertFalse(glob_match("**/a/**/b/**/c", "x/a/c/b"))

    def test_hidden_segments(self):
        self.assertFalse(glob_match("**/config", ".git/config"))
        self.assertFalse(glob_match("src/*/x", "src/.cache/x"))
        self.assertTrue(glob_match("src/.*/x", "src/.cache/x"))
        self.assertFalse(glob_match("?env", ".env"))
        self.assertFalse(glob_match("[.]env", ".env"))
        self.assertTrue(glob_match("a.*", "a.b"))
        self.assertTrue(glob_match("{.env,x}", ".env"))
        self.assertTrue(glob_match("**/.git/config", "repo/.git/config"))

    def test_class_never_matches_slash(self):
        self.assertFalse(glob_match("a[!x]b", "a/b"))
        self.assertFalse(glob_match("a[/]b", "a/b"))

    def test_class_edge_cases(self):
        self.assertTrue(glob_match("[a-cx-z]", "y"))
        self.assertFalse(glob_match("[a-cx-z]", "m"))
        self.assertTrue(glob_match("[*?]", "*"))
        self.assertTrue(glob_match("[{]", "{"))

    def test_nested_braces(self):
        p = "src/{lib,test/{unit,e2e}}/*.py"
        self.assertTrue(glob_match(p, "src/lib/a.py"))
        self.assertTrue(glob_match(p, "src/test/unit/a.py"))
        self.assertTrue(glob_match(p, "src/test/e2e/a.py"))
        self.assertFalse(glob_match(p, "src/test/a.py"))
        self.assertFalse(glob_match(p, "src/test/int/a.py"))

    def test_brace_with_wildcards_and_slash(self):
        self.assertTrue(glob_match("{a/*,b}.txt", "a/x.txt"))
        self.assertTrue(glob_match("{a/*,b}.txt", "b.txt"))
        self.assertFalse(glob_match("{a/*,b}.txt", "a/x/y.txt"))

    def test_empty_alternative(self):
        self.assertTrue(glob_match("file{,.bak}", "file"))
        self.assertTrue(glob_match("file{,.bak}", "file.bak"))

    def test_escapes(self):
        self.assertTrue(glob_match(r"\{a,b\}", "{a,b}"))
        self.assertFalse(glob_match(r"\{a,b\}", "a"))
        self.assertTrue(glob_match(r"\[x\]", "[x]"))
        self.assertTrue(glob_match(r"a\\b", "a\\b"))
        self.assertTrue(glob_match(r"{a\,b,c}", "a,b"))

    def test_errors(self):
        for bad in ["{a,b", "a\\", "x/[!a-", "{[}]"]:
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    glob_match(bad, "a")

    def test_whole_path_only(self):
        self.assertFalse(glob_match("a/b", "a/b/c"))
        self.assertFalse(glob_match("b/c", "a/b/c"))

    def test_polynomial_star(self):
        start = time.monotonic()
        self.assertFalse(glob_match("*a*a*a*a*a*a*a*a*a*a*b", "a" * 60))
        self.assertTrue(glob_match("*a*a*a*a*a*a*a*a*a*a*", "a" * 60))
        self.assertLess(time.monotonic() - start, 1.0)

    def test_polynomial_double_star(self):
        path = "/".join(["a"] * 40)
        start = time.monotonic()
        self.assertFalse(glob_match("**/a/**/a/**/a/**/a/**/a/**/b", path))
        self.assertLess(time.monotonic() - start, 1.0)


if __name__ == "__main__":
    unittest.main()
