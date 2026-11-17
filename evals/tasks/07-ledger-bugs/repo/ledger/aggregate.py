from ledger.dates import month_key


def group_by_month(entries, totals={}):
    """Sum amounts into {month: {account: cents}}."""
    for entry in entries:
        month = totals.setdefault(month_key(entry.day), {})
        month[entry.account] = month.get(entry.account, 0) + entry.amount_cents
    return totals
