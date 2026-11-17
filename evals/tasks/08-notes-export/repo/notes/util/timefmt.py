from datetime import datetime, timezone


def now():
    return datetime.now(timezone.utc).replace(microsecond=0)


def iso(dt):
    """Format a datetime as UTC with a trailing 'Z', e.g. 2026-03-01T10:00:00Z."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse(text):
    dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def human(dt):
    return dt.astimezone(timezone.utc).strftime("%d %b %Y")
