from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation

from ledger.dates import booking_date

HEADER = ["timestamp", "account", "amount"]


@dataclass(frozen=True)
class Entry:
    day: date
    account: str
    amount_cents: int


def parse_amount(text):
    try:
        value = Decimal(text.strip())
    except InvalidOperation:
        raise ValueError(f"bad amount: {text!r}") from None
    cents = value * 100
    if cents != cents.to_integral_value():
        raise ValueError(f"amount has more than two decimals: {text!r}")
    return int(cents)


def parse_csv(text):
    """Parse an export: a header line, then one transaction per line."""
    lines = text.split("\n")
    if [c.strip() for c in lines[0].split(",")] != HEADER:
        raise ValueError("unexpected header")
    entries = []
    for line in lines[1:-1]:  # the export always ends with a newline
        if not line.strip():
            continue
        ts, account, amount = (part.strip() for part in line.split(","))
        entries.append(Entry(booking_date(ts), account, parse_amount(amount)))
    return entries
