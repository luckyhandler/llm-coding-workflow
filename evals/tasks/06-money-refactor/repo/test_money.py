import unittest

from shop.money import format_cents, round_half_up


class MoneyTest(unittest.TestCase):
    def test_round_half_up(self):
        self.assertEqual(round_half_up(5, 2), 3)
        self.assertEqual(round_half_up(4, 2), 2)
        self.assertEqual(round_half_up(-5, 2), -3)
        self.assertEqual(round_half_up(149, 100), 1)
        self.assertEqual(round_half_up(150, 100), 2)

    def test_format_cents(self):
        self.assertEqual(format_cents(123456), "1,234.56")
        self.assertEqual(format_cents(-5), "-0.05")
        self.assertEqual(format_cents(0), "0.00")
        self.assertEqual(format_cents(1899), "18.99")


if __name__ == "__main__":
    unittest.main()
