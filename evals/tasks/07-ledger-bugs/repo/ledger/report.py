from ledger.aggregate import group_by_month
from ledger.importer import parse_csv


def monthly_report(csv_text):
    """Return [(month, account, cents)] sorted by month, then account."""
    totals = group_by_month(parse_csv(csv_text))
    rows = []
    for month in sorted(totals):  # 'YYYY-MM' sorts chronologically as text
        for account in sorted(totals[month]):
            rows.append((month, account, totals[month][account]))
    return rows


def format_report(rows):
    return "\n".join(f"{month}  {account:<10} {cents / 100:>10.2f}" for month, account, cents in rows)
