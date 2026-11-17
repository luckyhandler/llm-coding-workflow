from notes.models import Note
from notes.registry import command
from notes.util import timefmt
from notes.util.text import parse_tags


@command("add")
class AddCommand:
    help = "add a note"

    def configure(self, parser):
        parser.add_argument("title")
        parser.add_argument("body", nargs="?", default="")
        parser.add_argument("--tags", default="")

    def run(self, args, store, out):
        notes = store.load()
        note = Note(
            id=store.next_id(notes),
            title=args.title,
            body=args.body,
            created=timefmt.now(),
            tags=frozenset(parse_tags(args.tags)),
        )
        store.save(notes + [note])
        out.write(f"added #{note.id}\n")
        return 0
