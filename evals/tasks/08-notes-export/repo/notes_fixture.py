"""Shared test fixture: a store with a few known notes."""

import tempfile
from datetime import datetime, timezone
from pathlib import Path

from notes.models import Note
from notes.storage import JsonlStore


def utc(*args):
    return datetime(*args, tzinfo=timezone.utc)


NOTES = [
    Note(3, "Grocery list", "Milk, eggs", utc(2026, 3, 2, 8, 0), tags=frozenset({"home"})),
    Note(1, "Kickoff", "Agenda for Montag", utc(2026, 3, 1, 10, 0), utc(2026, 3, 4, 9, 30), frozenset({"work", "meeting"})),
    Note(2, "Old idea", "Archived thought", utc(2026, 3, 1, 10, 0), utc(2026, 3, 5, 12, 0), archived=True),
    Note(4, "Grüße an Jörg", "Café um 9", utc(2026, 3, 3, 23, 59, 59), tags=frozenset({"personal"})),
]


def make_store():
    directory = Path(tempfile.mkdtemp())
    store = JsonlStore(directory / "notes.jsonl")
    store.save(NOTES)
    return store
