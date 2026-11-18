from datetime import datetime


def parse_timestamp(text):
    """Parse an ISO-8601 timestamp, e.g. '2026-03-31T23:30:00-02:00'."""
    return datetime.fromisoformat(text.strip())


def booking_date(text):
    """The calendar date a transaction is booked on."""
    return parse_timestamp(text).date()


def month_key(day):
    return f"{day.year:04d}-{day.month:02d}"
