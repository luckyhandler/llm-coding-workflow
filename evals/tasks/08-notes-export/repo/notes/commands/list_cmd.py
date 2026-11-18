from notes.ordering import sort_notes, visible
from notes.registry import command
from notes.util.text import truncate


@command("list")
class ListCommand:
    help = "list notes"

    def configure(self, parser):
        parser.add_argument("--all", action="store_true", help="include archived notes")
        parser.add_argument("--width", type=int, default=40)

    def run(self, args, store, out):
        for note in sort_notes(visible(store.load(), args.all)):
            mark = " (archived)" if note.archived else ""
            out.write(f"{note.id:>4}  {truncate(note.title, args.width)}{mark}\n")
        return 0
