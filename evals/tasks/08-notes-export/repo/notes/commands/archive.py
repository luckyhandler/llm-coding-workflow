from notes.registry import command
from notes.util import timefmt


@command("archive")
class ArchiveCommand:
    help = "archive a note"

    def configure(self, parser):
        parser.add_argument("id", type=int)

    def run(self, args, store, out):
        notes = store.load()
        match = next((n for n in notes if n.id == args.id), None)
        if match is None:
            out.write(f"no note #{args.id}\n")
            return 1
        store.save(store.replace_note(notes, match.archive(timefmt.now())))
        return 0
