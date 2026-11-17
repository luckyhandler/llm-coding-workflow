import json
from pathlib import Path

from notes.models import Note
from notes.util import timefmt


def _to_record(note):
    return {
        "id": note.id,
        "title": note.title,
        "body": note.body,
        "created": timefmt.iso(note.created),
        "updated": timefmt.iso(note.updated) if note.updated else None,
        "tags": sorted(note.tags),
        "archived": note.archived,
    }


def _from_record(record):
    return Note(
        id=record["id"],
        title=record["title"],
        body=record["body"],
        created=timefmt.parse(record["created"]),
        updated=timefmt.parse(record["updated"]) if record.get("updated") else None,
        tags=frozenset(record.get("tags", ())),
        archived=record.get("archived", False),
    )


class JsonlStore:
    """Notes persisted one JSON object per line."""

    def __init__(self, path):
        self.path = Path(path)

    def load(self):
        if not self.path.exists():
            return []
        with self.path.open(encoding="utf-8") as fh:
            return [_from_record(json.loads(line)) for line in fh if line.strip()]

    def save(self, notes):
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        with tmp.open("w", encoding="utf-8") as fh:
            for note in notes:
                fh.write(json.dumps(_to_record(note), ensure_ascii=False) + "\n")
        tmp.replace(self.path)

    def next_id(self, notes):
        return max((n.id for n in notes), default=0) + 1

    def replace_note(self, notes, updated):
        return [updated if n.id == updated.id else n for n in notes]
