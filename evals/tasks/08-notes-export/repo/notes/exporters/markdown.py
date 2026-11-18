from notes.registry import exporter
from notes.util import timefmt


@exporter("md")
def export_markdown(notes):
    parts = []
    for note in notes:
        tags = " ".join(f"#{t}" for t in sorted(note.tags))
        header = f"## {note.title}"
        meta = f"_{timefmt.human(note.created)}_" + (f" {tags}" if tags else "")
        parts.append(f"{header}\n\n{meta}\n\n{note.body}\n")
    return "\n".join(parts)
