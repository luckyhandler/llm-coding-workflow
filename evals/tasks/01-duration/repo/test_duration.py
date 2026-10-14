import unittest

from duration import parse_duration


class ParseDurationTest(unittest.TestCase):
    def test_single_units(self):
        self.assertEqual(parse_duration("1s"), 1)
        self.assertEqual(parse_duration("2m"), 120)
        self.assertEqual(parse_duration("3h"), 10800)
        self.assertEqual(parse_duration("4d"), 345600)
        self.assertEqual(parse_duration("5w"), 3024000)

    def test_combined(self):
        self.assertEqual(parse_duration("1h30m"), 5400)
        self.assertEqual(parse_duration("1w2d3h"), 788400)
        self.assertEqual(parse_duration("2h15m30s"), 8130)

    def test_empty(self):
        self.assertEqual(parse_duration(""), 0)

    def test_errors(self):
        for bad in ["10x", "abc", "1h30", "-5m", "h30"]:
            with self.assertRaises(ValueError, msg=bad):
                parse_duration(bad)


if __name__ == "__main__":
    unittest.main()
