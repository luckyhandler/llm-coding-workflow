import hashlib
import pathlib
import unittest
from datetime import date

from ledger.aggregate import group_by_month
from ledger.dates import booking_date
from ledger.importer import Entry, parse_csv

REPORT_SHA256 = "38bc00c7840cb0de05a1499a2fb7faecef237c6d1acf14f81e5461c125c3ad7a"


class HiddenLedgerTest(unittest.TestCase):
    def test_report_module_unchanged(self):
        source = pathlib.Path(__file__).with_name("ledger") / "report.py"
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), REPORT_SHA256)

    def test_group_by_month_has_no_shared_state(self):
        entries = [Entry(date(2026, 1, 5), "food", -100)]
        self.assertEqual(group_by_month(entries), {"2026-01": {"food": -100}})
        self.assertEqual(group_by_month(entries), {"2026-01": {"food": -100}})
        self.assertEqual(group_by_month([]), {})

    def test_group_by_month_still_accepts_totals(self):
        totals = {"2026-01": {"food": -50}}
        result = group_by_month([Entry(date(2026, 1, 5), "food", -100)], totals)
        self.assertEqual(result["2026-01"]["food"], -150)

    def test_booking_date_is_utc(self):
        self.assertEqual(booking_date("2026-01-01T00:30:00+01:00"), date(2025, 12, 31))
        self.assertEqual(booking_date("2026-06-30T22:00:00-03:00"), date(2026, 7, 1))
        self.assertEqual(booking_date("2026-05-05T23:59:00"), date(2026, 5, 5))
        self.assertEqual(booking_date("2026-05-05T23:59:00Z"), date(2026, 5, 5))
        self.assertEqual(booking_date("2026-05-05T12:00:00+05:30"), date(2026, 5, 5))

    def test_parse_csv_line_endings(self):
        header = "timestamp,account,amount"
        row = "2026-02-01T10:00:00+00:00,fun,-1.00"
        self.assertEqual(len(parse_csv(f"{header}\n{row}")), 1)
        self.assertEqual(len(parse_csv(f"{header}\n{row}\n")), 1)
        self.assertEqual(len(parse_csv(f"{header}\n{row}\n\n{row}")), 2)
        self.assertEqual(parse_csv(header), [])

    def test_parse_csv_validation_kept(self):
        with self.assertRaises(ValueError):
            parse_csv("when,account,amount\n")
        with self.assertRaises(ValueError):
            parse_csv("timestamp,account,amount\n2026-02-01T10:00:00+00:00,x,1.005\n")


if __name__ == "__main__":
    unittest.main()
