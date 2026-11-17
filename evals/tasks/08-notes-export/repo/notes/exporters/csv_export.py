import csv
import io

from notes.registry import exporter
from notes.util import timefmt


@exporter("csv")
def export_csv(notes):
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(["id", "title", "created", "tags"])
    for note in notes:
        writer.writerow([note.id, note.title, timefmt.iso(note.created), ";".join(sorted(note.tags))])
    return buf.getvalue()
