import unittest

from ledger.report import monthly_report

EXPORT = """timestamp,account,amount
2026-03-02T09:15:00+01:00,groceries,-45.20
2026-03-15T12:00:00+01:00,salary,3200.00
2026-03-31T23:30:00-02:00,groceries,-12.80
2026-04-01T08:00:00+02:00,rent,-950.00
"""


class MonthlyReportTest(unittest.TestCase):
    def test_report(self):
        self.assertEqual(monthly_report(EXPORT), [
            ("2026-03", "groceries", -4520),
            ("2026-03", "salary", 320000),
            ("2026-04", "groceries", -1280),
            ("2026-04", "rent", -95000),
        ])

    def test_report_is_repeatable(self):
        first = monthly_report(EXPORT)
        second = monthly_report(EXPORT)
        self.assertEqual(first, second)

    def test_export_without_trailing_newline(self):
        rows = monthly_report(EXPORT.rstrip("\n"))
        self.assertIn(("2026-04", "rent", -95000), rows)


if __name__ == "__main__":
    unittest.main()
