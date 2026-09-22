import unittest

from semver import compare_semver, parse_semver


class ParseSemverTest(unittest.TestCase):
    def test_plain(self):
        self.assertEqual(parse_semver("1.2.3"), (1, 2, 3, ()))

    def test_prerelease_types(self):
        self.assertEqual(parse_semver("1.2.3-alpha.1"), (1, 2, 3, ("alpha", 1)))

    def test_build_metadata_ignored(self):
        self.assertEqual(parse_semver("1.2.3+build.7"), (1, 2, 3, ()))
        self.assertEqual(parse_semver("1.2.3-rc.1+sha.abc"), (1, 2, 3, ("rc", 1)))

    def test_invalid(self):
        for bad in ["1.2", "1.2.3.4", "a.b.c", "1.2.3-", "", "1.2.-3"]:
            with self.assertRaises(ValueError, msg=bad):
                parse_semver(bad)


class CompareSemverTest(unittest.TestCase):
    def test_numeric_order(self):
        self.assertEqual(compare_semver("1.0.0", "1.0.1"), -1)
        self.assertEqual(compare_semver("1.2.0", "1.10.0"), -1)
        self.assertEqual(compare_semver("2.0.0", "1.9.9"), 1)
        self.assertEqual(compare_semver("1.2.3", "1.2.3"), 0)

    def test_prerelease_below_release(self):
        self.assertEqual(compare_semver("1.0.0-alpha", "1.0.0"), -1)
        self.assertEqual(compare_semver("1.0.0", "1.0.0-alpha"), 1)

    def test_prerelease_precedence(self):
        self.assertEqual(compare_semver("1.0.0-alpha.1", "1.0.0-alpha.2"), -1)
        self.assertEqual(compare_semver("1.0.0-alpha", "1.0.0-beta"), -1)
        self.assertEqual(compare_semver("1.0.0-alpha", "1.0.0-alpha.1"), -1)

    def test_numeric_identifiers_below_alphanumeric(self):
        self.assertEqual(compare_semver("1.0.0-1", "1.0.0-alpha"), -1)
        self.assertEqual(compare_semver("1.0.0-alpha.1", "1.0.0-alpha.beta"), -1)
        self.assertEqual(compare_semver("1.0.0-alpha.9", "1.0.0-alpha.10"), -1)

    def test_sorts_a_run(self):
        versions = ["1.0.0", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-beta.2", "1.0.0-rc.1"]
        self.assertEqual(
            sorted(versions, key=lambda v: _Key(v)),
            ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-beta.2", "1.0.0-rc.1", "1.0.0"],
        )


class _Key:
    def __init__(self, value):
        self.value = value

    def __lt__(self, other):
        return compare_semver(self.value, other.value) < 0


if __name__ == "__main__":
    unittest.main()
